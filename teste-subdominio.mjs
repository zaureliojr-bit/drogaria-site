/* O domínio de cada farmácia: maisbarato.drogalink.com.br

   O que está sendo provado, e por que cada coisa importa:

     1. a plataforma não muda. É 100% do tráfego de hoje, e um middleware
        que roda em toda requisição é o lugar mais fácil de quebrar tudo;
     2. no domínio da farmácia, a vitrine DELA responde na raiz;
     3. as páginas dela são canônicas DE SI MESMAS. Apontar para a
        plataforma empurraria para o nosso domínio tudo que ela construir
        no Google — o contrário de dar um endereço a ela, e a primeira
        coisa que a dona de uma rede pergunta;
     4. subdomínio reservado (painel, www) não é farmácia;
     5. cadastro fora do ar não vira laço de redirecionamento. No domínio
        dela, "manda para a home" É esta página.

   Sem navegador de propósito: tudo aqui é cabeçalho e HTML, e um teste
   que roda em dois segundos é um teste que se roda.

   Uso:
     node stub-porteiro.mjs &
     npx wrangler pages dev public --port 8821 \
       --binding PEDIDOS_PROXY_URL=http://127.0.0.1:8899 \
       --binding DOMINIO_PLATAFORMA=teste.local
     BASE=http://127.0.0.1:8821 node teste-subdominio.mjs
*/

/* Em vez de fetch: o Host é "forbidden header" no fetch do Node, apagado
   em silêncio. O teste inteiro passava como se fosse a plataforma, e dava
   verde onde não devia — pior que falhar. node:http manda o que eu
   escrevo. */
import http from "node:http";

const BASE = process.env.BASE || "http://127.0.0.1:8821";

let falhas = 0;
function conferir(descricao, condicao, detalhe = "") {
    if (condicao) console.log(`  ok   ${descricao}`);
    else {
        console.log(`  FALHA ${descricao}${detalhe ? "  → " + detalhe : ""}`);
        falhas++;
    }
}

function buscar(caminho, host) {
    const endereco = new URL(BASE + caminho);
    return new Promise((resolve, rejeitar) => {
        const pedido = http.request({
            host: endereco.hostname,
            port: endereco.port,
            path: endereco.pathname + endereco.search,
            method: "GET",
            headers: { Host: host || endereco.host }
        }, (resposta) => {
            const partes = [];
            resposta.on("data", (p) => partes.push(p));
            resposta.on("end", () => resolve({
                status: resposta.statusCode,
                local: resposta.headers.location || "",
                tipo: resposta.headers["content-type"] || "",
                corpo: Buffer.concat(partes).toString("utf8")
            }));
        });
        pedido.on("error", rejeitar);
        pedido.end();
    });
}

/* seguir: para arquivo estático. A própria Pages redireciona
   /carrinho.html para /carrinho, e isso é dela, não nosso — o que o teste
   quer saber é se o arquivo chega. */
async function pedir(caminho, host, { seguir = false } = {}) {
    let r = await buscar(caminho, host);
    let saltos = 0;
    while (seguir && r.status >= 300 && r.status < 400 && r.local && saltos++ < 5) {
        r = await buscar(new URL(r.local, BASE + caminho).pathname, host);
    }

    const corpo = /text|json|xml/.test(r.tipo) ? r.corpo : "";
    const achar = (re) => {
        const m = re.exec(corpo);
        return m ? m[1] : "";
    };
    return {
        status: r.status,
        local: r.local,
        corpo,
        titulo: achar(/<title>([^<]*)<\/title>/),
        canonico: achar(/rel="canonical" href="([^"]*)"/),
        catalogo: achar(/name="catalogo" content="([^"]*)"/)
    };
}

/* ---- 1. a plataforma, que é todo o tráfego de hoje ------------------ */
console.log("\n1. no domínio da plataforma, nada muda");
{
    const home = await pedir("/", "teste.local");
    conferir("a home responde 200", home.status === 200, String(home.status));
    conferir("e continua canônica do endereço de produção",
        /drogaria-site\.pages\.dev/.test(home.canonico), home.canonico);

    const vitrine = await pedir("/loja/mais-barato", "teste.local");
    conferir("/loja/<slug> continua servindo a vitrine",
        /Drogaria Mais Barato/.test(vitrine.titulo), vitrine.titulo);
    conferir("canônica de /loja/<slug>", /\/loja\/mais-barato$/.test(vitrine.canonico), vitrine.canonico);

    const produto = await pedir("/produto/dipirona-7891106000888", "teste.local");
    conferir("a página canônica de produto não tem loja",
        /\/produto\/dipirona-7891106000888$/.test(produto.canonico), produto.canonico);
    conferir("e não aponta catálogo de loja nenhuma", produto.catalogo === "", produto.catalogo);

    const css = await pedir("/style.css", "teste.local", { seguir: true });
    conferir("arquivo estático continua servido", css.status === 200, String(css.status));
}

/* ---- 2. o domínio da farmácia -------------------------------------- */
console.log("\n2. no domínio da farmácia, a vitrine dela é a raiz");
{
    const raiz = await pedir("/", "mais-barato.teste.local");
    conferir("a raiz responde a vitrine dela", /Drogaria Mais Barato/.test(raiz.titulo), raiz.titulo);
    conferir("e é canônica de si mesma — o endereço é DELA",
        raiz.canonico === "http://mais-barato.teste.local/", raiz.canonico);
    conferir("com o catálogo dela", /produtos\.json$/.test(raiz.catalogo), raiz.catalogo);

    const outra = await pedir("/", "farma-centro.teste.local");
    conferir("outra farmácia, outra vitrine", /Farmácia do Centro/.test(outra.titulo), outra.titulo);
    conferir("e outro catálogo", /produtos-farma-centro\.json$/.test(outra.catalogo), outra.catalogo);

    /* A marca dela também: a filial de Cuiabá tem logotipo e cor próprios
       no cadastro de mentira. Sem isso, o cliente dela abriria o site com
       a identidade de uma farmácia concorrente. */
    conferir("e a marca dela", /logo-centro\.png/.test(outra.corpo), "logotipo não trocado");
    conferir("inclusive a cor", /#0a7d4b/.test(outra.corpo), "cor não aplicada");
}

/* ---- 3. produto no domínio da farmácia ------------------------------ */
console.log("\n3. a página de produto no domínio dela");
{
    const p = await pedir("/produto/dipirona-7891106000888", "farma-centro.teste.local");
    conferir("abre a página", p.status === 200, String(p.status));
    conferir("com o nome da farmácia no título", /Farmácia do Centro/.test(p.titulo), p.titulo);
    conferir("com o catálogo dela", /produtos-farma-centro\.json$/.test(p.catalogo), p.catalogo);

    /* A asserção que importa: canônica de si mesma. */
    conferir("e canônica de si mesma, no domínio dela",
        p.canonico === "http://farma-centro.teste.local/produto/dipirona-7891106000888",
        p.canonico);
}

/* ---- 4. o que NÃO é farmácia --------------------------------------- */
console.log("\n4. subdomínio que não é loja");
{
    for (const host of ["painel.teste.local", "www.teste.local", "app.teste.local"]) {
        const r = await pedir("/", host);
        conferir(`${host} não vira vitrine de farmácia`,
            !/São Bernardo do Campo\/SP/.test(r.titulo), r.titulo);
    }

    /* O painel tem um subdomínio só dele, e nele a RAIZ é o painel.

       O painel mora em /painel, porque é uma página do mesmo projeto da
       loja. Sem o desvio, quem digita o endereço do painel cai na
       vitrine da farmácia — que foi o que aconteceu no primeiro teste
       do domínio de verdade. */
    const painel = await pedir("/", "painel.teste.local");
    conferir("a raiz do domínio do painel desvia para o painel",
        painel.status === 302 && /\/painel$/.test(painel.local),
        `${painel.status} ${painel.local}`);

    /* E o resto do domínio do painel continua servindo normalmente: é o
       mesmo projeto, e o painel carrega CSS, ícones e o manifesto. */
    const css = await pedir("/style.css", "painel.teste.local", { seguir: true });
    conferir("e os arquivos do painel continuam servidos",
        css.status === 200, String(css.status));

    /* Dois níveis não é loja: aceitar abriria um número infinito de
       endereços equivalentes para a mesma página. */
    const fundo = await pedir("/", "a.b.teste.local");
    conferir("subdomínio de dois níveis não vira loja",
        !/São Bernardo do Campo\/SP/.test(fundo.titulo), fundo.titulo);

    /* Domínio de outra plataforma não é nosso problema. */
    const fora = await pedir("/", "mais-barato.outrodominio.com");
    conferir("host de fora segue para a home da plataforma",
        fora.status === 200 && !/São Bernardo do Campo\/SP/.test(fora.titulo), fora.titulo);
}

/* ---- 5. apelido que não existe ------------------------------------- */
console.log("\n5. subdomínio apontado para farmácia que não existe");
{
    const r = await pedir("/", "naoexiste.teste.local");
    conferir("responde 404", r.status === 404, String(r.status));
    conferir("e diz o que conferir, em vez de só 'não encontrada'",
        /apelido do domínio/.test(r.corpo), r.corpo.slice(0, 80));
}

/* ---- 6. a vitrine de outra, dentro do domínio dela ------------------ */
console.log("\n6. /loja/<outra> dentro do domínio de uma farmácia");
{
    const r = await pedir("/loja/farma-centro", "mais-barato.teste.local");
    conferir("não serve a concorrente no endereço dela",
        r.status === 302, String(r.status));
    conferir("manda para a vitrine certa, que é a raiz",
        /\/$/.test(r.local), r.local);
}

/* ---- 7. o resto do site continua igual ------------------------------ */
console.log("\n7. carrinho, encarte e arquivos no domínio dela");
{
    for (const caminho of ["/carrinho.html", "/style.css", "/logo.png"]) {
        const r = await pedir(caminho, "mais-barato.teste.local", { seguir: true });
        conferir(`${caminho} responde`, r.status === 200, String(r.status));
    }
}

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

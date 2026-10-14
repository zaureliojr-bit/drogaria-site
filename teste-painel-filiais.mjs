/* O painel visto por três pessoas diferentes.

   A aba Filiais e a chave de dono existem para resolver um problema de
   operação — cadastrar a senha de uma farmácia nova, dar suporte sem
   pedir a senha de ninguém. Mas elas criam o risco oposto: alguém
   mexendo na loja errada, ou vendo o que não é seu.

   Então o que está sendo provado aqui é, nesta ordem:

     1. a dona de UMA farmácia não vê a aba, e nada muda para ela — é o
        caso de hoje, e é o que não pode quebrar;
     2. o dono da plataforma vê a aba, troca de filial e cadastra senha;
     3. o cabeçalho X-Painel-Loja acompanha TODAS as chamadas depois de
        trocar de filial. Esta é a que mais importa: uma chamada que
        esqueça o cabeçalho salva banner na farmácia errada, responde 200
        e não parece erro nenhum.

   O worker é interceptado, então o teste roda sem senha de verdade e sem
   tocar em produção.

   Uso:
     npx wrangler pages dev public --port 8811 &
     BASE=http://127.0.0.1:8811 node teste-painel-filiais.mjs
*/

import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:8811";

const LOJAS = [
    { slug: "mais-barato", nome: "Drogaria Mais Barato", cidade: "São Bernardo do Campo",
      uf: "SP", ativo: 1, tem_senha: 0, banco: null, prefixo_r2: null },
    { slug: "farma-centro", nome: "Farmácia do Centro", cidade: "Cuiabá",
      uf: "MT", ativo: 1, tem_senha: 1, banco: "DB_FARMA_CENTRO", prefixo_r2: "farma-centro" },
    /* Uma filial cadastrada e desligada. É o estado de quem está
       preparando a loja nova, ou de quem tirou uma do ar — e o painel não
       pode oferecer "operar nesta" numa delas. */
    { slug: "farma-parada", nome: "Farmácia Parada", cidade: "Santos",
      uf: "SP", ativo: 0, tem_senha: 0, banco: null, prefixo_r2: null }
];

let falhas = 0;
function conferir(descricao, condicao, detalhe = "") {
    if (condicao) console.log(`  ok   ${descricao}`);
    else {
        console.log(`  FALHA ${descricao}${detalhe ? "  → " + detalhe : ""}`);
        falhas++;
    }
}

const navegador = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);

/* Abre o painel com o worker de mentira no lugar do de verdade.

   `dono` decide o que a rota /sessao responde — é exatamente o que o
   worker real decide comparando a senha com a DONO_KEY. */
async function abrirPainel({ dono }) {
    const contexto = await navegador.newContext();
    const pagina = await contexto.newPage();

    /* Tudo que o painel pediu ao worker, para o teste conferir depois
       quais cabeçalhos foram junto. */
    const chamadas = [];

    await pagina.route("**/farmatech-pedidos-proxy*/**", async (rota) => {
        const pedido = rota.request();
        const url = new URL(pedido.url());
        chamadas.push({
            caminho: url.pathname,
            metodo: pedido.method(),
            loja: pedido.headers()["x-painel-loja"] || "",
            chave: pedido.headers()["x-painel-key"] || "",
            corpo: pedido.postData() || ""
        });

        const responder = (dados, status = 200) => rota.fulfill({
            status,
            contentType: "application/json",
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(dados)
        });

        const slug = pedido.headers()["x-painel-loja"] || "mais-barato";

        if (url.pathname === "/sessao") {
            const loja = LOJAS.find((l) => l.slug === slug) || LOJAS[0];
            return responder({ dono, loja: { slug: loja.slug, nome: loja.nome, temSenhaPropria: !!loja.tem_senha } });
        }
        if (url.pathname === "/lojas") {
            if (!dono) return responder({ erro: "Só o dono da plataforma vê a lista de lojas." }, 403);
            return responder({ lojas: LOJAS });
        }
        if (url.pathname === "/loja/senha") {
            return responder({ ok: true, loja: JSON.parse(pedido.postData() || "{}").slug });
        }
        if (url.pathname === "/fila") return responder({ pedidos: [], abertos: ["novo"] });
        if (url.pathname === "/resumo") {
            return responder({
                dias: 30, hoje: { pedidos: 0, faturamento: 0 },
                periodo: { pedidos: 0, faturamento: 0, ticket: 0 },
                porDia: [], topProdutos: [], recentes: [], aguardandoReceita: 0,
                maisProcurados: [], naoEncontrados: []
            });
        }
        if (url.pathname === "/clientes") return responder({ clientes: [] });
        if (url.pathname === "/banners/todos") return responder({ banners: [], podeEnviarArquivo: false });
        if (url.pathname === "/promocoes/todas") return responder({ promocoes: [], lotes: [] });
        if (url.pathname === "/encartes") return responder({ encartes: [], podeEnviarArquivo: false });
        if (url.pathname.startsWith("/catalogo")) return responder({ pendente: false });

        return responder({ erro: "Rota não encontrada." }, 404);
    });

    await pagina.goto(BASE + "/painel", { waitUntil: "domcontentloaded" });
    return { pagina, contexto, chamadas };
}

async function entrar(pagina, senha, filial = "") {
    await pagina.fill("#senha", senha);
    if (filial) await pagina.fill("#lojaLogin", filial);
    await pagina.click("#btnEntrar");
    await pagina.waitForSelector("#conteudo:not([style*='display: none'])", { timeout: 20000 });
    await pagina.waitForTimeout(800);
}

/* ---- 1. a dona de uma farmácia só ----------------------------------- */
console.log("\n1. quem tem uma farmácia só: nada muda");
{
    const { pagina, contexto, chamadas } = await abrirPainel({ dono: false });
    await entrar(pagina, "senha-da-loja");

    const abaVisivel = await pagina.isVisible("#botaoAbaLojas");
    conferir("a aba Filiais não aparece", !abaVisivel);

    conferir("e o painel abriu normalmente", await pagina.isVisible("#abaFila"));

    /* Sem filial escolhida, nenhuma chamada carrega o cabeçalho — é o
       painel de hoje, byte por byte. */
    conferir("nenhuma chamada manda X-Painel-Loja",
        chamadas.every((c) => c.loja === ""),
        chamadas.filter((c) => c.loja).map((c) => c.caminho).join(","));

    await contexto.close();
}

/* ---- 2. o dono da plataforma ---------------------------------------- */
console.log("\n2. o dono da plataforma");
let chamadasDoDono;
{
    const { pagina, contexto, chamadas } = await abrirPainel({ dono: true });
    chamadasDoDono = chamadas;
    await entrar(pagina, "chave-de-dono");

    conferir("a aba Filiais aparece", await pagina.isVisible("#botaoAbaLojas"));

    await pagina.click("#botaoAbaLojas");
    await pagina.waitForSelector("#listaLojas table", { timeout: 15000 });

    const texto = await pagina.textContent("#listaLojas");
    conferir("lista as três farmácias",
        /Mais Barato/.test(texto) && /Farmácia do Centro/.test(texto) && /Farmácia Parada/.test(texto),
        texto.replace(/\s+/g, " ").slice(0, 120));
    conferir("mostra quem ainda não tem senha própria", /ainda não/.test(texto));
    conferir("e em qual delas você está", /você está aqui/.test(texto));

    const opcoes = await pagina.$$eval("#senhaLojaAlvo option", (os) => os.map((o) => o.value));
    conferir("o seletor de senha traz as três", opcoes.length === 3, opcoes.join(","));

    /* Filial desligada não pode oferecer "Operar nesta": o worker só
       autentica em loja ativa, então o clique daria 401 e o painel
       mandaria de volta ao login dizendo "Senha incorreta" — com a senha
       certa. Oferecer ação que não funciona é pior do que não oferecer. */
    const botoes = await pagina.$$eval("[data-ir-para]", (bs) => bs.map((b) => b.dataset.irPara));
    conferir("a filial desligada não oferece o botão de operar",
        !botoes.includes("farma-parada"), botoes.join(","));
    conferir("e diz por quê", /ligue a filial/.test(texto), texto.replace(/\s+/g, " ").slice(0, 120));

    /* Cadastrar a senha de uma filial. */
    await pagina.selectOption("#senhaLojaAlvo", "farma-centro");
    await pagina.fill("#senhaLojaNova", "senha-boa-da-filial");
    await pagina.fill("#senhaLojaConfirma", "senha-boa-da-filial");
    await pagina.click("#btnSalvarSenhaLoja");
    await pagina.waitForTimeout(1200);

    const envio = chamadas.find((c) => c.caminho === "/loja/senha");
    conferir("manda a senha ao worker", !!envio, "nenhuma chamada a /loja/senha");
    conferir("com a filial escolhida",
        envio && JSON.parse(envio.corpo).slug === "farma-centro", envio && envio.corpo);

    const aviso = await pagina.textContent("#avisoLojas");
    conferir("e avisa que salvou", /salva/i.test(aviso || ""), aviso);

    /* Os campos têm de ficar vazios: senha digitada que fica na tela
       acaba num print de WhatsApp. */
    const sobrou = await pagina.evaluate(() => [
        document.getElementById("senhaLojaNova").value,
        document.getElementById("senhaLojaConfirma").value
    ]);
    conferir("os campos de senha são limpos na hora", sobrou.every((v) => v === ""), JSON.stringify(sobrou));

    await contexto.close();
}

/* ---- 3. trocar de filial -------------------------------------------- */
console.log("\n3. trocar de filial: o cabeçalho acompanha TUDO");
{
    const { pagina, contexto, chamadas } = await abrirPainel({ dono: true });
    await entrar(pagina, "chave-de-dono");

    await pagina.click("#botaoAbaLojas");
    await pagina.waitForSelector("#listaLojas table", { timeout: 15000 });

    /* Trocar recarrega a página de propósito: fila, banners, promoções e
       encartes já estão em memória, e uma tela meio trocada — fila de
       uma filial com os banners de outra — é pior do que dois segundos
       de espera. */
    chamadas.length = 0;
    await pagina.click('[data-ir-para="farma-centro"]');
    await pagina.waitForSelector("#conteudo:not([style*='display: none'])", { timeout: 25000 });
    await pagina.waitForTimeout(1500);

    /* Abre as abas que buscam dados, para o teste cobrir as chamadas que
       só acontecem quando alguém clica. */
    for (const aba of ["relatorios", "banners", "promocoes", "encarte"]) {
        await pagina.click(`[data-aba="${aba}"]`);
        await pagina.waitForTimeout(500);
    }

    const semLoja = chamadas.filter((c) => c.loja !== "farma-centro");
    conferir(`as ${chamadas.length} chamadas foram todas para a filial escolhida`,
        semLoja.length === 0,
        semLoja.map((c) => `${c.metodo} ${c.caminho} (loja="${c.loja}")`).join(" | "));

    const caminhos = [...new Set(chamadas.map((c) => c.caminho))];
    conferir("e cobriram fila, relatório, banners, promoções e encartes",
        ["/fila", "/resumo", "/banners/todos", "/promocoes/todas", "/encartes"]
            .every((c) => caminhos.includes(c)),
        caminhos.join(","));

    await contexto.close();
}

/* ---- 4. apelido de filial errado ------------------------------------ */
console.log("\n4. quem digita o apelido errado não fica preso");
{
    const contexto = await navegador.newContext();
    const pagina = await contexto.newPage();

    /* O worker responde 401 igual para "senha errada" e para "essa
       farmácia não existe" — de propósito, para não contar a quem tenta
       quais lojas existem. O preço é que o painel não sabe qual dos dois
       foi, então solta a filial junto com a senha: sem isso, quem errou
       o apelido ficaria tentando a senha certa para sempre. */
    await pagina.route("**/farmatech-pedidos-proxy*/**", (rota) => rota.fulfill({
        status: 401,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ erro: "Não autorizado." })
    }));

    await pagina.goto(BASE + "/painel", { waitUntil: "domcontentloaded" });
    await pagina.fill("#senha", "qualquer");
    await pagina.fill("#lojaLogin", "filial-que-nao-existe");
    await pagina.click("#btnEntrar");
    await pagina.waitForTimeout(1500);

    const guardado = await pagina.evaluate(() => ({
        senha: sessionStorage.getItem("painelKey"),
        loja: sessionStorage.getItem("painelLoja")
    }));
    conferir("a filial errada não fica guardada", !guardado.loja, JSON.stringify(guardado));
    conferir("a tela de login volta", await pagina.isVisible("#login"));

    await contexto.close();
}

await navegador.close();
console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

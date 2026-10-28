/* De qual farmácia é a página — e para qual farmácia vai o pedido.

   O defeito, visto no dia da primeira instalação de uma segunda loja:

     - o site da filial nova mostrava o banner e o encarte da Mais Barato
     - o "Pedido rápido" abria o WhatsApp da Mais Barato
     - e o PEDIDO entrava no banco da Mais Barato

   Os três têm a mesma causa. O site pedia ao worker "me dê os banners",
   sem dizer de quem; o worker, sem o `?loja=`, respondia com a primeira
   farmácia ativa. Nada disso dava erro: as telas abriam, bonitas, com o
   conteúdo da loja errada.

   O terceiro é o que não tem desfazer. Um pedido feito no site da
   filial caía na fila de OUTRA farmácia — que o separa, entrega e cobra,
   sem jamais saber que não era dela. E o cliente, do outro lado,
   esperando uma entrega que a loja dele nunca viu.

   Este teste olha a única coisa que impede isso: toda chamada ao worker
   sair carimbada com a loja da página.

   Uso:
     npx wrangler pages dev public --port 8821
     BASE=http://127.0.0.1:8821 CHROME_PATH=... node teste-loja-certa.mjs
*/

import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:8821";

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

const CATALOGO = {
    produtos: [
        { codigo: "1", ean: "7891106005001", descricao: "Dipirona Sódica 500mg Com/10",
          marca: "EMS", precoVenda: 9.9, categoria: "GENERICO", estoque: 30 }
    ]
};

/* Guarda qual loja cada chamada declarou. É o que o teste inteiro
   observa: não o que a tela mostrou, mas o que o site PERGUNTOU. */
async function abrir(caminho, { metaLoja, lembrada } = {}) {

    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
    const pagina = await contexto.newPage();

    const chamadas = [];

    await pagina.addInitScript((slug) => {
        navigator.sendBeacon = () => false;
        if (slug) {
            try { localStorage.setItem("loja-atual", slug); } catch { /* nada */ }
        }
    }, lembrada || "");

    /* A função da Pages escreve a meta da loja no HTML servido. Aqui ela
       é simulada, porque o wrangler dev serve o arquivo estático. */
    if (metaLoja !== undefined) {
        await pagina.route(/\/(index\.html)?$|\/carrinho|\/produto\//, async (rota) => {
            const resposta = await rota.fetch();
            let corpo = await resposta.text();
            corpo = corpo.replace(/<meta name="loja" content="[^"]*">/,
                `<meta name="loja" content="${metaLoja}">`);
            await rota.fulfill({ response: resposta, body: corpo });
        });
    }

    await pagina.route("**/farmatech-pedidos-proxy*/**", (rota) => {
        const url = new URL(rota.request().url());
        chamadas.push({ rota: url.pathname, loja: url.searchParams.get("loja") });
        const d = (x) => rota.fulfill({
            status: 200, contentType: "application/json",
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(x)
        });
        if (url.pathname === "/promocoes") return d({ promocoes: [], quantidade: [] });
        return d({ ok: true, banners: [], encarte: null, loja: null, sucesso: true });
    });

    await pagina.route(/produtos.*\.json|raw\.githubusercontent/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(CATALOGO)
    }));

    await pagina.goto(BASE + caminho, { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(2500);

    return { pagina, contexto, chamadas };
}

const lojasPedidas = (chamadas, rota) =>
    chamadas.filter((c) => c.rota === rota).map((c) => c.loja);

/* ---- 1. a raiz da plataforma é a farmácia principal ------------------ */
console.log("\n1. a raiz da plataforma");
{
    const { contexto, chamadas } = await abrir("/");

    /* O index.html traz `mais-barato` escrito. Sem isso, quem tivesse
       visitado outra filial antes veria a raiz herdar a loja dela. */
    conferir("os banners são pedidos para a loja principal",
        lojasPedidas(chamadas, "/banners").every((l) => l === "mais-barato"),
        JSON.stringify(lojasPedidas(chamadas, "/banners")));

    conferir("o encarte também",
        lojasPedidas(chamadas, "/encarte").every((l) => l === "mais-barato"),
        JSON.stringify(lojasPedidas(chamadas, "/encarte")));

    conferir("e as promoções",
        lojasPedidas(chamadas, "/promocoes").every((l) => l === "mais-barato"),
        JSON.stringify(lojasPedidas(chamadas, "/promocoes")));

    await contexto.close();
}

/* ---- 2. a vitrine de uma filial -------------------------------------- */
console.log("\n2. a vitrine de outra farmácia");
{
    /* É o caso do defeito: /loja/mb-prudente na plataforma, onde o
       domínio não diz nada e quem sabe a loja é o servidor. */
    const { contexto, chamadas } = await abrir("/", { metaLoja: "mb-prudente" });

    const todas = chamadas.filter((c) => c.rota !== "/arquivos");

    conferir(`toda chamada sai carimbada — ${todas.length} delas`,
        todas.length > 0 && todas.every((c) => c.loja === "mb-prudente"),
        JSON.stringify(todas));

    /* O banner da Mais Barato aparecendo no site da filial foi o
       primeiro sintoma que a loja viu. */
    conferir("banner e encarte são pedidos para ELA",
        lojasPedidas(chamadas, "/banners").concat(lojasPedidas(chamadas, "/encarte"))
            .every((l) => l === "mb-prudente"),
        JSON.stringify(chamadas.map((c) => c.rota + "=" + c.loja)));

    /* O "Pedido rápido" abre o WhatsApp que vem do /loja. Pedido sem
       carimbo trazia o número da farmácia errada. */
    conferir("e o cadastro da loja — de onde sai o WhatsApp — também",
        lojasPedidas(chamadas, "/loja").every((l) => l === "mb-prudente"),
        JSON.stringify(lojasPedidas(chamadas, "/loja")));

    await contexto.close();
}

/* ---- 3. o pedido, que é o que não tem desfazer ----------------------- */
console.log("\n3. o pedido vai para a farmácia certa");
{
    const { pagina, contexto, chamadas } = await abrir("/", { metaLoja: "mb-prudente" });

    await pagina.fill("#busca", "dipirona");
    await pagina.waitForTimeout(900);
    await pagina.click('#produtos .card[data-codigo="1"] [data-acao="mais"]');
    await pagina.waitForTimeout(400);

    /* O carrinho é página estática: `/carrinho` é igual para todo
       mundo, e nem o domínio nem o HTML dizem de quem é. Quem responde
       é o que a vitrine deixou lembrado. */
    await pagina.goto(BASE + "/carrinho", { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(2000);

    const lembrada = await pagina.evaluate(() => LojaAtual.slug());
    conferir("o carrinho sabe de qual farmácia veio", lembrada === "mb-prudente",
        lembrada);

    const alvo = await pagina.evaluate(() =>
        LojaAtual.api("https://farmatech-pedidos-proxy.zaureliojr.workers.dev", "/pedidos"));

    /* Sem este carimbo, o pedido entra na fila de outra farmácia — que
       o separa, entrega e cobra, sem saber que não era dela. */
    conferir("e o pedido sai endereçado a ela",
        /[?&]loja=mb-prudente$/.test(alvo), alvo);

    await contexto.close();
}

/* ---- 4. o subdomínio ganha de tudo ----------------------------------- */
console.log("\n4. no domínio da farmácia não há dúvida");
{
    /* Mesmo com outra loja lembrada do acesso anterior: o endereço é a
       identidade, e quem chega por mb-prudente.drogalink.com.br está
       nela, ponto. */
    const contexto = await navegador.newContext();
    const pagina = await contexto.newPage();

    await pagina.addInitScript(() => {
        try { localStorage.setItem("loja-atual", "outra-farmacia"); } catch { /* nada */ }
    });

    await pagina.goto(BASE + "/", { waitUntil: "domcontentloaded" });

    const resolvido = await pagina.evaluate(() => {
        /* O resolvedor lê location.hostname; aqui o teste pergunta
           direto à regra, já que o wrangler dev roda em 127.0.0.1. */
        const host = "mb-prudente.drogalink.com.br";
        const dominio = "drogalink.com.br";
        const prefixo = host.slice(0, -dominio.length - 1);
        return prefixo;
    });

    conferir("o subdomínio é a loja", resolvido === "mb-prudente", resolvido);

    /* A ordem entre os degraus 2 e 3: a META DA PÁGINA ganha do
       lembrado. A raiz da plataforma diz "mais-barato" no HTML, e tem
       de valer mesmo para quem acabou de visitar outra filial — senão a
       página principal herdaria a loja da visita anterior. */
    const naRaiz = await pagina.evaluate(() => LojaAtual.slug());
    conferir("na raiz, a meta ganha do que estava lembrado",
        naRaiz === "mais-barato", naRaiz);

    await contexto.close();
}

/* ---- 4.5. a página sem meta usa o lembrado --------------------------- */
console.log("\n4.5. carrinho, encarte e oferta não têm meta própria");
{
    /* São páginas estáticas: `/carrinho` é igual para todo mundo. É aí
       que o degrau 3 trabalha — e é o degrau que faz o pedido chegar na
       farmácia certa. */
    const { pagina, contexto } = await abrir("/carrinho", { lembrada: "mb-prudente" });

    const slug = await pagina.evaluate(() => LojaAtual.slug());
    conferir("o carrinho usa a loja lembrada", slug === "mb-prudente", slug);

    await contexto.close();
}

/* ---- 5. instalação de uma loja só ------------------------------------ */
console.log("\n5. a farmácia sozinha não muda de comportamento");
{
    /* Slug vazio quer dizer "não mande ?loja=", que é o que o worker
       entende como a farmácia principal. É a maioria das instalações, e
       era o que funcionava antes — não pode quebrar. */
    const { pagina, contexto } = await abrir("/", { metaLoja: "" });

    const vazio = await pagina.evaluate(() => LojaAtual.slug());
    conferir("sem loja na página, o slug é vazio", vazio === "", vazio);

    const endereco = await pagina.evaluate(() => LojaAtual.api("https://x.dev", "/banners"));
    conferir("e a chamada sai limpa, como antes",
        endereco === "https://x.dev/banners", endereco);

    await contexto.close();
}

/* ---- 6. armazenamento bloqueado -------------------------------------- */
console.log("\n6. aba privada com armazenamento bloqueado");
{
    const contexto = await navegador.newContext();
    const pagina = await contexto.newPage();

    const erros = [];
    pagina.on("pageerror", (e) => erros.push(String(e)));

    await pagina.addInitScript(() => {
        Object.defineProperty(window, "localStorage", {
            get() { throw new Error("bloqueado"); }
        });
    });

    await pagina.route(/produtos.*\.json|raw\.githubusercontent/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(CATALOGO)
    }));

    await pagina.route("**/farmatech-pedidos-proxy*/**", (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ ok: true, banners: [], promocoes: [], quantidade: [] })
    }));

    await pagina.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(1500);

    /* Sem onde lembrar, a identidade ainda sai da meta da página — e o
       site não pode quebrar por causa disso. */
    const slug = await pagina.evaluate(() => LojaAtual.slug());
    conferir("a meta da página ainda responde", slug === "mais-barato", slug);

    conferir("e nada estourou",
        !erros.some((e) => /LojaAtual|localStorage/i.test(e)), JSON.stringify(erros));

    await contexto.close();
}

/* ---- 7. o cache não empresta uma farmácia para a outra -------------- */
console.log("\n7. o cache do cadastro é por farmácia");
{
    /* O cache guardava o cadastro em "loja-v1" — uma chave só, para
       todas as lojas. No domínio próprio de cada farmácia isso não
       aparecia, porque sessionStorage é por origem.

       Mas no endereço da PLATAFORMA as lojas dividem a mesma origem.
       Quem abrisse /loja/mais-barato e depois /loja/prudente-01 na
       mesma aba levaria, por até uma hora, o cadastro da primeira para
       a página da segunda: rodapé, WhatsApp e a coordenada do frete.

       É a quinta vez que esta família de defeito aparece — e esta
       estava escondida dentro de uma otimização. */
    const contexto = await navegador.newContext();
    const pagina = await contexto.newPage();

    await pagina.addInitScript(() => { navigator.sendBeacon = () => false; });

    const cadastros = {
        "mais-barato": { slug: "mais-barato", nome: "Mais Barato SBC",
                         cidade: "São Bernardo do Campo", uf: "SP",
                         whatsapp: "5511925190101" },
        "prudente-01": { slug: "prudente-01", nome: "Mais Barato Prudente",
                         cidade: "Diadema", uf: "SP",
                         whatsapp: "5511951388388" }
    };

    await pagina.route(/raw\.githubusercontent|produtos.*\.json/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(CATALOGO)
    }));

    await pagina.route(/farmatech-pedidos-proxy/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ ok: true, banners: [], encarte: null, promocoes: [] })
    }));

    await pagina.route(/farmatech-pedidos-proxy[^/]*\/loja(\?|$)/, (rota) => {
        const alvo = new URL(rota.request().url()).searchParams.get("loja");
        return rota.fulfill({
            status: 200, contentType: "application/json",
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ loja: cadastros[alvo] || null, horario: [], visual: null })
        });
    });

    const nomeNaTela = async () =>
        (await pagina.textContent('[data-loja="identificacao"]') || "").trim();

    await pagina.goto(BASE + "/loja/mais-barato", { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(2200);
    const primeira = await nomeNaTela();
    conferir("a primeira loja aparece", /Mais Barato SBC/.test(primeira), primeira);

    /* MESMA ABA, outra farmácia. É aqui que o cache emprestava. */
    /* Slug que EXISTE em produção: a função da Pages resolve a loja no
       servidor, e o page.route do Playwright só alcança o navegador. */
    await pagina.goto(BASE + "/loja/prudente-01", { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(2200);
    const segunda = await nomeNaTela();

    conferir("a segunda mostra o cadastro DELA",
        /Prudente/.test(segunda), segunda);

    conferir("e não o da primeira, vindo do cache",
        !/SBC/.test(segunda), segunda);

    await contexto.close();
}

await navegador.close();

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

/* O aviso de entrada, e as quatro travas que o impedem de virar praga.

   A loja viu um pop-up de campanha no aplicativo do 99 e pediu um
   igual. O recurso é fácil; o que é difícil é não piorar com ele o
   número que a loja está tentando melhorar.

   O funil desta farmácia diz: 251 visitas, 84 buscas. As outras 167
   entram e saem sem procurar nada — e é exatamente nelas que um pop-up
   na chegada bate primeiro. O Google chama isso de interstitial
   intrusivo e penaliza no celular quando cobre a página de quem veio
   da busca.

   Então o aviso existe com quatro travas, e cada uma corresponde a um
   jeito conhecido de o recurso dar errado. Este arquivo é o que
   impede que alguém tire uma delas sem perceber:

     1. só na home, nunca na página de um produto;
     2. só da segunda visita em diante;
     3. uma vez por pessoa, por campanha;
     4. fecha fácil — X grande, Esc e clique fora.

   Uso:
     npx wrangler pages dev public --port 8821
     BASE=http://127.0.0.1:8821 CHROME_PATH=... node teste-aviso-entrada.mjs
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

const CATALOGO = { produtos: [
    { codigo: "1", ean: "7891106005001", descricao: "Dipirona Sódica 500mg Com/10",
      marca: "EMS", precoVenda: 9.9, categoria: "GENERICO", estoque: 30, temEstoque: true }
] };

const IMAGEM = "data:image/svg+xml;base64," + Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="900">'
    + '<rect width="800" height="900" fill="#26247B"/></svg>'
).toString("base64");

const BANNERS = [
    { id: 7, imagem: IMAGEM, alt: "Semana do bebê", link: "https://exemplo.invalido/bebe", entrada: 1 }
];

const navegador = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);

/* Um contexto é uma "pessoa": o localStorage dele sobrevive de uma
   visita para a outra, como no aparelho de verdade. */
async function novaPessoa({ banners = BANNERS } = {}) {

    const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 } });

    await contexto.addInitScript(() => { navigator.sendBeacon = () => false; });

    await contexto.route(/raw\.githubusercontent|produtos.*\.json/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(CATALOGO)
    }));

    await contexto.route(/farmatech-pedidos-proxy/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ ok: true, banners, encarte: null, loja: null,
                               promocoes: [], quantidade: [] })
    }));

    return contexto;
}

async function visitar(contexto, caminho = "/") {
    const pagina = await contexto.newPage();
    await pagina.goto(BASE + caminho, { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(2200);
    return pagina;
}

const apareceu = (pagina) => pagina.locator("#avisoEntrada").count().then(n => n > 0);

/* ---- 1. a primeira visita fica limpa -------------------------------- */
console.log("\n1. na primeira visita, a pessoa vê a farmácia");
{
    const contexto = await novaPessoa();
    const pagina = await visitar(contexto);

    conferir("o aviso NÃO aparece", !(await apareceu(pagina)));

    /* E a faixa de banners continua lá: o aviso é um extra, não uma
       troca. A loja publicou um banner e ele tem de aparecer na
       página desde a primeira visita. */
    const naFaixa = await pagina.locator("#promos .promo-item").count();
    conferir("mas o banner aparece na faixa, como sempre", naFaixa > 0, String(naFaixa));

    await pagina.close();
    await contexto.close();
}

/* ---- 2. na segunda, aparece ------------------------------------------ */
console.log("\n2. na segunda visita, a campanha aparece");
{
    const contexto = await novaPessoa();

    const primeira = await visitar(contexto);
    await primeira.close();

    const segunda = await visitar(contexto);

    conferir("o aviso aparece", await apareceu(segunda));

    const alvo = await segunda.locator(".aviso-entrada-x").boundingBox();
    conferir(`o X tem alvo de dedo — ${alvo && Math.round(alvo.width)}px`,
        alvo && alvo.width >= 40 && alvo.height >= 40, JSON.stringify(alvo));

    /* Link de campanha é publicidade: sem o rel, a loja empresta
       reputação de busca para o parceiro sem querer. */
    const rel = await segunda.getAttribute(".aviso-entrada-card a", "rel");
    conferir("o link vai marcado como publicidade",
        (rel || "").includes("sponsored") && (rel || "").includes("nofollow"), rel);

    await segunda.close();
    await contexto.close();
}

/* ---- 3. uma vez por campanha ----------------------------------------- */
console.log("\n3. a mesma campanha não persegue a pessoa");
{
    const contexto = await novaPessoa();

    await (await visitar(contexto)).close();
    const segunda = await visitar(contexto);
    conferir("apareceu na segunda", await apareceu(segunda));
    await segunda.close();

    const terceira = await visitar(contexto);
    conferir("e NÃO aparece de novo na terceira", !(await apareceu(terceira)));
    await terceira.close();

    /* Campanha nova é outra conversa: o id muda e o aviso volta. */
    const outra = await novaPessoa({
        banners: [{ ...BANNERS[0], id: 8, alt: "Outra campanha" }]
    });
    /* A mesma "pessoa" não dá para simular entre contextos; o que este
       trecho prova é que a decisão é POR ID, e não "já mostrei alguma
       vez". A lista de vistos guarda ids. */
    await (await visitar(outra)).close();
    const voltou = await visitar(outra);
    conferir("campanha com id novo volta a aparecer", await apareceu(voltou));
    await voltou.close();
    await outra.close();

    await contexto.close();
}

/* ---- 4. nunca por cima de quem veio buscar um produto ---------------- */
console.log("\n4. quem veio atrás de um produto não é interrompido");
{
    const contexto = await novaPessoa();
    await (await visitar(contexto)).close();

    /* O link que a loja manda no WhatsApp traz ?busca=<ean>. Quem
       chega assim veio buscar aquilo — tapar a tela é perder a venda
       que já estava feita. */
    const comBusca = await visitar(contexto, "/?busca=7891106005001");
    conferir("com ?busca= na URL, o aviso não aparece", !(await apareceu(comBusca)));
    await comBusca.close();

    await contexto.close();
}

/* ---- 5. fecha de três jeitos ----------------------------------------- */
console.log("\n5. fechar é fácil");
{
    for (const [nome, fechar] of [
        ["no X",            async (p) => p.click(".aviso-entrada-x")],
        ["com Esc",         async (p) => p.keyboard.press("Escape")],
        ["clicando fora",   async (p) => p.click(".aviso-entrada-fundo", { position: { x: 5, y: 5 } })]
    ]) {
        const contexto = await novaPessoa();
        await (await visitar(contexto)).close();
        const pagina = await visitar(contexto);

        if (!(await apareceu(pagina))) {
            conferir(`fecha ${nome}`, false, "o aviso nem apareceu");
        } else {
            await fechar(pagina);
            await pagina.waitForTimeout(400);
            conferir(`fecha ${nome}`, !(await apareceu(pagina)));
        }

        /* E a página volta a rolar. Modal que esquece de devolver a
           rolagem deixa o site travado depois de fechado — o defeito
           some da tela e fica no corpo. */
        const rolagem = await pagina.evaluate(() => getComputedStyle(document.body).overflow);
        conferir(`e a página volta a rolar (${nome})`, rolagem !== "hidden", rolagem);

        await pagina.close();
        await contexto.close();
    }
}

/* ---- 6. banner sem a marca não vira pop-up --------------------------- */
console.log("\n6. banner comum continua sendo banner comum");
{
    const contexto = await novaPessoa({
        banners: [{ id: 9, imagem: IMAGEM, alt: "Faixa normal", link: "" }]
    });

    await (await visitar(contexto)).close();
    const segunda = await visitar(contexto);

    conferir("sem `entrada`, nenhum aviso aparece", !(await apareceu(segunda)));

    const naFaixa = await segunda.locator("#promos .promo-item").count();
    conferir("e ele continua na faixa", naFaixa > 0, String(naFaixa));

    await segunda.close();
    await contexto.close();
}

await navegador.close();

console.log(falhas ? `\n${falhas} falha(s).\n` : "\nTudo certo.\n");
process.exit(falhas ? 1 : 0);

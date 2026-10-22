/* O cupom do lado do cliente, e do lado de quem cobra.

   A regra está no worker e tem teste lá (pedidos-proxy/teste-cupons.mjs).
   O que se prova aqui é o que nenhum teste de servidor pega:

     1. o desconto que aparece na tela é o que o SERVIDOR mandou — a
        página não calcula nada, porque cálculo no navegador é cálculo
        que qualquer um reescreve;
     2. o cupom cai sozinho quando o carrinho muda de valor. Sem isso,
        quem aplica "R$ 10 acima de R$ 50" e depois tira itens até R$ 30
        fecha o pedido vendo um desconto que o servidor vai recusar — e
        descobre no balcão;
     3. o pedido manda o CÓDIGO e não o desconto;
     4. e a atendente vê o cupom na fila, junto do pedido. Um total
        menor que a soma dos itens, sem explicação, é o caminho mais
        curto para alguém cobrar o preço cheio de quem tinha desconto.

   Uso:
     npx wrangler pages dev public --port 8821
     BASE=http://127.0.0.1:8821 CHROME_PATH=... node teste-cupom-na-tela.mjs
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

const CATALOGO = {
    produtos: [
        { codigo: "1", ean: "7891106000001", descricao: "Dipirona 500mg C/10",
          precoVenda: "30.00", categoria: "GENERICO", estoque: 10 },
        { codigo: "2", ean: "7891106000002", descricao: "Protetor Solar FPS 50",
          precoVenda: "40.00", categoria: "HIGIENE", estoque: 10 }
    ]
};

const navegador = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);

/* O worker de mentira. O cupom BEMVINDO10 dá R$ 10 acima de R$ 50 — e
   a decisão é DELE, não da página. */
async function abrirCarrinho(carrinho) {

    const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 } });
    const pagina = await contexto.newPage();

    const chamadas = [];

    await pagina.addInitScript((itens) => {
        localStorage.setItem("carrinho", JSON.stringify(itens));
    }, carrinho);

    await pagina.route(/produtos.*\.json|raw\.githubusercontent/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(CATALOGO)
    }));

    await pagina.route("**/farmatech-pedidos-proxy*/**", async (rota) => {

        const url = new URL(rota.request().url());
        const corpo = rota.request().postData();
        chamadas.push({ rota: url.pathname, corpo: corpo ? JSON.parse(corpo) : null });

        const responder = (dados) => rota.fulfill({
            status: 200, contentType: "application/json",
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(dados)
        });

        if (url.pathname === "/cupom/validar") {
            const pedido = JSON.parse(corpo || "{}");
            if (String(pedido.codigo).toUpperCase() !== "BEMVINDO10") {
                return responder({ valido: false, motivo: "Cupom não encontrado." });
            }
            if (Number(pedido.subtotal) < 50) {
                return responder({ valido: false, motivo: "Este cupom vale em pedidos a partir de R$ 50,00." });
            }
            return responder({ valido: true, codigo: "BEMVINDO10", tipo: "valor", desconto: 10 });
        }

        if (url.pathname === "/pedidos") return responder({ sucesso: true });
        return responder({ ok: true });
    });

    await pagina.goto(BASE + "/carrinho.html", { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(3000);

    return { pagina, contexto, chamadas };
}

const DOIS_ITENS = [
    { codigo: "1", ean: "7891106000001", nome: "Dipirona 500mg C/10", preco: 30, qtd: 1 },
    { codigo: "2", ean: "7891106000002", nome: "Protetor Solar FPS 50", preco: 40, qtd: 1 }
];

const texto = (pagina, sel) => pagina.textContent(sel).then((t) => (t || "").replace(/\s+/g, " ").trim());

/* ---- 1. aplicar ----------------------------------------------------- */
console.log("\n1. o cliente digita o código");
{
    const { pagina, contexto, chamadas } = await abrirCarrinho(DOIS_ITENS);

    conferir("o resumo começa sem linha de desconto",
        await pagina.locator("#linhaDesconto").isHidden());

    await pagina.fill("#cupom", "bemvindo10");
    await pagina.click("#aplicarCupom");
    await pagina.waitForTimeout(600);

    /* O desconto que aparece é o que o servidor mandou. A página nem
       sabe a regra: ela mandou subtotal e código, e desenhou a
       resposta. */
    const perguntou = chamadas.find((c) => c.rota === "/cupom/validar");
    conferir("a página perguntou ao servidor", !!perguntou, JSON.stringify(chamadas.map((c) => c.rota)));
    conferir("mandando o subtotal, não o desconto",
        perguntou && perguntou.corpo.subtotal === 70 && perguntou.corpo.desconto === undefined,
        JSON.stringify(perguntou && perguntou.corpo));

    conferir("a linha de desconto aparece", await pagina.locator("#linhaDesconto").isVisible());
    conferir("com o valor que veio de lá", /10,00/.test(await texto(pagina, "#resumoDesconto")),
        await texto(pagina, "#resumoDesconto"));
    conferir("e o código ao lado", /BEMVINDO10/.test(await texto(pagina, "#rotuloDesconto")),
        await texto(pagina, "#rotuloDesconto"));

    /* 70 − 10 = 60. Retirada, então sem frete. */
    conferir("o total desceu", /60,00/.test(await texto(pagina, "#resumoTotal")),
        await texto(pagina, "#resumoTotal"));

    await contexto.close();
}

/* ---- 2. código errado ----------------------------------------------- */
console.log("\n2. um código que não existe");
{
    const { pagina, contexto } = await abrirCarrinho(DOIS_ITENS);

    await pagina.fill("#cupom", "DESCONTO90");
    await pagina.click("#aplicarCupom");
    await pagina.waitForTimeout(600);

    conferir("não aplica desconto nenhum", await pagina.locator("#linhaDesconto").isHidden());
    conferir("e diz o que houve",
        /não encontrado/i.test(await texto(pagina, "#cupomRecado")),
        await texto(pagina, "#cupomRecado"));
    conferir("o total continua cheio", /70,00/.test(await texto(pagina, "#resumoTotal")),
        await texto(pagina, "#resumoTotal"));

    await contexto.close();
}

/* ---- 3. o carrinho muda depois do cupom ------------------------------ */
console.log("\n3. o cliente tira um item depois de aplicar");
{
    const { pagina, contexto } = await abrirCarrinho(DOIS_ITENS);

    await pagina.fill("#cupom", "BEMVINDO10");
    await pagina.click("#aplicarCupom");
    await pagina.waitForTimeout(600);
    conferir("aplicou com R$ 70", await pagina.locator("#linhaDesconto").isVisible());

    /* Tira o protetor de R$ 40: sobra R$ 30, abaixo do mínimo de 50. */
    await pagina.click('.item [data-acao="menos"]');
    await pagina.waitForTimeout(900);

    /* O defeito que isto impede: o desconto continuar na tela depois de
       o carrinho deixar de ter direito a ele. A pessoa fecharia o
       pedido achando que paga 20, o servidor recusaria o cupom, e a
       conversa de ajuste sobraria para o balcão. */
    conferir("o cupom cai sozinho quando o pedido fica abaixo do mínimo",
        await pagina.locator("#linhaDesconto").isHidden(),
        await texto(pagina, "#resumoDesconto"));

    conferir("e a tela explica por quê",
        /a partir de/i.test(await texto(pagina, "#cupomRecado")),
        await texto(pagina, "#cupomRecado"));

    await contexto.close();
}

/* ---- 4. o que vai no pedido ----------------------------------------- */
console.log("\n4. o pedido manda o código, não o desconto");
{
    const { pagina, contexto, chamadas } = await abrirCarrinho(DOIS_ITENS);

    await pagina.fill("#cupom", "BEMVINDO10");
    await pagina.click("#aplicarCupom");
    await pagina.waitForTimeout(600);

    await pagina.fill("#nome", "Maria Gorete");
    await pagina.fill("#telefone", "11954664429");
    await pagina.selectOption("#pagamento", { index: 1 });
    await pagina.waitForTimeout(200);

    /* O WhatsApp abriria numa aba nova; aqui ele é neutralizado para o
       teste seguir. */
    await pagina.evaluate(() => { window.open = () => ({ closed: false, focus() {} }); });

    await pagina.click(".btn-finalizar");
    await pagina.waitForTimeout(1200);

    const enviado = chamadas.filter((c) => c.rota === "/pedidos").pop();

    conferir("o pedido foi gravado", !!enviado, JSON.stringify(chamadas.map((c) => c.rota)));
    conferir("com o código do cupom", enviado && enviado.corpo.cupom === "BEMVINDO10",
        JSON.stringify(enviado && enviado.corpo.cupom));

    /* Mandar o desconto daqui seria pedir para o navegador dizer quanto
       quer pagar. Quem recalcula é o worker. */
    conferir("e sem mandar o desconto", enviado && enviado.corpo.desconto === undefined,
        JSON.stringify(enviado && Object.keys(enviado.corpo)));

    await contexto.close();
}

await navegador.close();

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

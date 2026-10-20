/* A busca tem endereço, e dá para mandar a lista.

   O pedido que originou isto: o cliente pergunta no WhatsApp "tem
   ibuprofeno?", e a atendente quer mandar a lista com os preços em vez
   de pedir que ele procure sozinho na home.

   O que havia antes: ?busca=ibuprofeno FUNCIONAVA ao abrir, mas o
   código apagava o parâmetro da barra logo depois — e buscar na caixa
   nunca escrevia nada ali. O link existia e não havia como copiá-lo.

   Uso:
     BASE=http://127.0.0.1:8821 CHROME_PATH=... node teste-busca-link.mjs
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
        { codigo: "1", ean: "7891000000001", descricao: "Ibuprofeno 400mg C/20",
          precoVenda: "12.90", categoria: "GENERICO" },
        { codigo: "2", ean: "7891000000002", descricao: "Ibuprofeno 600mg C/20",
          precoVenda: "18.90", categoria: "GENERICO" },
        { codigo: "3", ean: "7891000000003", descricao: "Dipirona 500mg C/10",
          precoVenda: "9.90", categoria: "GENERICO" }
    ]
};

const navegador = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);

async function abrir(caminho = "/") {
    const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 } });
    const pagina = await contexto.newPage();
    await pagina.route(/produtos.*\.json|raw\.githubusercontent/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(CATALOGO)
    }));
    await pagina.goto(BASE + caminho, { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(3000);
    return { pagina, contexto };
}

/* ---- 1. buscar escreve o endereço ------------------------------------ */
console.log("\n1. buscar na caixa escreve o endereço");
{
    const { pagina, contexto } = await abrir();

    conferir("a home começa sem parâmetro", !location0(await pagina.url()));

    await pagina.fill("#busca", "ibuprofeno");
    await pagina.click(".btn-buscar");
    await pagina.waitForTimeout(1200);

    const url = new URL(pagina.url());
    conferir("o endereço passa a ter o termo",
        url.searchParams.get("busca") === "ibuprofeno", pagina.url());

    const cards = await pagina.$$eval(".card", (c) => c.length);
    conferir("e a lista é só de ibuprofeno", cards === 2, `${cards} cards`);

    await contexto.close();
}

/* ---- 2. o link funciona de verdade ----------------------------------- */
console.log("\n2. abrir o link já cai na lista");
{
    const { pagina, contexto } = await abrir("/?busca=ibuprofeno");

    const titulo = await pagina.textContent("#resultadoTitulo");
    conferir("abre já filtrado", /ibuprofeno/i.test(titulo || ""), titulo);

    const cards = await pagina.$$eval(".card", (c) => c.length);
    conferir("com os dois produtos", cards === 2, `${cards} cards`);

    /* O defeito antigo: o parâmetro era apagado logo depois de abrir,
       então quem recebeu o link não conseguia repassá-lo. */
    conferir("e o endereço NÃO é apagado da barra",
        new URL(pagina.url()).searchParams.get("busca") === "ibuprofeno",
        pagina.url());

    await contexto.close();
}

/* ---- 3. limpar a busca limpa o endereço ------------------------------- */
console.log("\n3. limpar a busca limpa o endereço");
{
    const { pagina, contexto } = await abrir("/?busca=ibuprofeno");

    await pagina.fill("#busca", "");
    await pagina.click(".btn-buscar");
    await pagina.waitForTimeout(1200);

    conferir("o parâmetro some",
        !new URL(pagina.url()).searchParams.has("busca"), pagina.url());

    await contexto.close();
}

/* ---- 4. o botão de mandar a lista ------------------------------------- */
console.log("\n4. o botão de mandar a lista");
{
    const { pagina, contexto } = await abrir();

    conferir("não aparece na home", await pagina.isHidden("#compartilharBusca"));

    await pagina.fill("#busca", "ibuprofeno");
    await pagina.click(".btn-buscar");
    await pagina.waitForTimeout(1200);

    conferir("aparece quando há resultado", await pagina.isVisible("#compartilharBusca"));

    /* Sem navigator.share (é o caso do computador do balcão), copia. */
    await pagina.evaluate(() => {
        delete navigator.share;
        window.__copiado = "";
        navigator.clipboard.writeText = async (t) => { window.__copiado = t; };
    });

    await pagina.click("#compartilharBusca");
    await pagina.waitForTimeout(600);

    const copiado = await pagina.evaluate(() => window.__copiado);

    conferir("copia o link da lista",
        /\?busca=ibuprofeno/.test(copiado || ""), copiado);
    /* Link sozinho chega no WhatsApp como uma caixa de prévia sem
       contexto; com uma linha antes, chega como resposta. */
    conferir("com uma linha de texto antes",
        /ibuprofeno/i.test(copiado || "") && copiado.split("\n").length > 1,
        JSON.stringify(copiado));
    conferir("dizendo quantas opções são",
        /\b2\b/.test(copiado || ""), copiado);

    await contexto.close();
}

/* ---- 5. busca sem resultado ------------------------------------------- */
console.log("\n5. busca sem resultado não oferece mandar nada");
{
    const { pagina, contexto } = await abrir();

    await pagina.fill("#busca", "xxxxyyyy");
    await pagina.click(".btn-buscar");
    await pagina.waitForTimeout(1200);

    conferir("o botão some", await pagina.isHidden("#compartilharBusca"));

    await contexto.close();
}

function location0(u) { return new URL(u).searchParams.has("busca"); }

await navegador.close();
console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

/* O link "← Ver o site" do cabeçalho do painel.

   Ele é o link que a dona da farmácia copia da barra de endereço para
   mandar no grupo da família. Apontar para
   drogaria-site.pages.dev/loja/mais-barato depois de o domínio dela
   existir é entregar o endereço errado justamente no momento em que
   ela está mostrando o site para alguém.

   O que está sendo provado:

     1. sem domínio próprio, leva à vitrine DESTA filial no endereço da
        plataforma — e não à raiz, que é o site de outra farmácia;
     2. com o domínio próprio de pé, troca sozinho para ele;
     3. e o link funciona desde o primeiro instante: a troca é uma
        melhora, não uma espera.

   Uso:
     BASE=http://127.0.0.1:8821 CHROME_PATH=... node teste-painel-ver-site.mjs
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

async function abrir({ dominioNoAr }) {

    const contexto = await navegador.newContext();
    const pagina = await contexto.newPage();

    /* O domínio da farmácia. Abortar é o que o navegador faz de
       verdade quando o DNS não resolve — que é o caso de uma filial
       ainda sem Custom Domain. */
    await pagina.route(/drogalink\.com\.br/, (rota) =>
        dominioNoAr
            ? rota.fulfill({ status: 200, contentType: "image/png", body: "" })
            : rota.abort("namenotresolved"));

    await pagina.route("**/farmatech-pedidos-proxy*/**", (rota) => {
        const caminho = new URL(rota.request().url()).pathname;
        const responder = (dados, status = 200) => rota.fulfill({
            status, contentType: "application/json",
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(dados)
        });
        if (caminho === "/sessao") {
            return responder({ dono: false, loja: { slug: "mais-barato", nome: "Mais Barato", temSenhaPropria: true } });
        }
        if (caminho === "/fila") return responder({ pedidos: [], abertos: ["novo"] });
        if (caminho.startsWith("/catalogo")) return responder({ pendente: false });
        return responder({ erro: "não encontrada" }, 404);
    });

    await pagina.goto(BASE + "/painel", { waitUntil: "domcontentloaded" });
    await pagina.fill("#senha", "qualquer");
    await pagina.click("#btnEntrar");
    await pagina.waitForSelector("#conteudo:not([style*='display: none'])", { timeout: 20000 });

    return { pagina, contexto };
}

/* ---- 1. sem domínio próprio ------------------------------------------ */
console.log("\n1. filial sem domínio próprio");
{
    const { pagina, contexto } = await abrir({ dominioNoAr: false });

    /* Lido logo, antes de qualquer espera: o link tem de funcionar
       desde o primeiro instante. */
    const naHora = await pagina.getAttribute("#verSite", "href");
    conferir("o link já aponta para algo que abre",
        /\/loja\/mais-barato$/.test(naHora), naHora);
    conferir("e não para a raiz, que é o site de outra farmácia",
        !/pages\.dev\/?$/.test(naHora), naHora);

    await pagina.waitForTimeout(6000);
    const depois = await pagina.getAttribute("#verSite", "href");
    conferir("e continua assim, já que o domínio dela não existe",
        depois === naHora, depois);

    await contexto.close();
}

/* ---- 2. com domínio próprio ------------------------------------------ */
console.log("\n2. filial com o domínio dela de pé");
{
    const { pagina, contexto } = await abrir({ dominioNoAr: true });

    for (let i = 0; i < 40; i++) {
        const atual = await pagina.getAttribute("#verSite", "href");
        if (/drogalink\.com\.br/.test(atual)) break;
        await pagina.waitForTimeout(250);
    }

    const href = await pagina.getAttribute("#verSite", "href");
    conferir("o link passa a ser o endereço DELA",
        href === "https://mais-barato.drogalink.com.br/", href);

    await contexto.close();
}

await navegador.close();
console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

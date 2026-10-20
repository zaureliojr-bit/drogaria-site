/* O banner da home, na tela do celular.

   O defeito: os banners que a loja publica são 3:1 (1200x400 e
   1920x650, conferido no que está no ar), mas o CSS forçava 2:1 no
   celular. Com object-fit: cover, isso come UM TERÇO da largura —
   sumia o começo da chamada de um lado e os produtos do outro.

   E o encaixe do carrossel ignorava o respiro lateral: o banner
   encostava na borda esquerda enquanto 14px do próximo apareciam na
   direita. Torto dos dois lados ao mesmo tempo.

   Uso:
     BASE=http://127.0.0.1:8821 CHROME_PATH=... node teste-banner-celular.mjs
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

/* Três larguras de celular comuns: o iPhone SE é o mais estreito que
   ainda se usa, e é onde corte e estouro aparecem primeiro. */
for (const largura of [360, 390, 430]) {

    console.log(`\ntela de ${largura}px`);

    const contexto = await navegador.newContext({ viewport: { width: largura, height: 844 } });
    const pagina = await contexto.newPage();

    await pagina.route(/produtos.*\.json|raw\.githubusercontent/, (rota) => rota.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ produtos: [{ codigo: "1", ean: "7891000000001",
            descricao: "Dipirona 500mg C/10", precoVenda: "9.90", categoria: "GENERICO" }] })
    }));

    await pagina.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(5000);

    const temBanner = await pagina.$(".promo-item img");
    if (!temBanner) { console.log("  (sem banner publicado — nada a conferir)"); await contexto.close(); continue; }

    const medida = await pagina.evaluate(() => {
        const img = document.querySelector(".promo-item img");
        const caixa = img.getBoundingClientRect();
        const itens = [...document.querySelectorAll(".promo-item")];
        const primeiro = itens[0].getBoundingClientRect();
        const segundo = itens[1] ? itens[1].getBoundingClientRect() : null;
        return {
            prop: caixa.width / caixa.height,
            ajuste: getComputedStyle(img).objectFit,
            margemEsquerda: Math.round(primeiro.x),
            margemDireita: Math.round(innerWidth - primeiro.right),
            espiada: segundo ? Math.max(0, Math.round(innerWidth - segundo.x)) : 0,
            estoura: document.documentElement.scrollWidth > document.documentElement.clientWidth
        };
    });

    /* A proporção da caixa tem de ser a dos banners publicados. Se um
       dia alguém voltar a forçar 2:1 aqui, isto falha. */
    conferir("a caixa do banner é 3:1, como os banners publicados",
        Math.abs(medida.prop - 3) < 0.05, medida.prop.toFixed(2) + ":1");

    /* contain, e não cover: no dia em que entrar um banner fora da
       proporção, ele aparece inteiro com uma tarja fina em vez de ter a
       chamada cortada. */
    conferir("e a imagem cabe inteira, sem cortar",
        medida.ajuste === "contain", medida.ajuste);

    conferir("margem igual dos dois lados",
        medida.margemEsquerda === medida.margemDireita && medida.margemEsquerda > 0,
        `esquerda ${medida.margemEsquerda} · direita ${medida.margemDireita}`);

    conferir("o próximo banner não espia pela borda",
        medida.espiada <= 4, `${medida.espiada}px aparecendo`);

    conferir("e a página não estoura para o lado", !medida.estoura);

    await contexto.close();

}

await navegador.close();
console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

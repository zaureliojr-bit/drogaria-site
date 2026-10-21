/* O que cabe na primeira tela do celular.

   Medido no site no ar antes de mexer, numa tela de 390x844:

     grudado no topo   215px  (cabeçalho 92 + busca 58 + filtros 65)
     tira de ofertas   174px  entre os filtros e o primeiro produto
     primeiro produto  441px

   Ou seja: um quarto da tela ocupado o tempo todo, e o cliente abrindo
   uma farmácia para ver três miniaturas de anúncio antes de ver um
   produto. Nada disso aparece num teste de função — só medindo a
   página montada.

   Os números aqui são tetos, não alvos exatos: eles existem para que
   uma barra nova grudada no topo, ou um bloco novo empurrando os
   produtos para baixo, precise passar por uma decisão em vez de
   entrar sem ninguém perceber.

   Uso:
     npx wrangler pages dev public --port 8821 --binding DOMINIO_PLATAFORMA=teste.local
     BASE=http://127.0.0.1:8821 CHROME_PATH=... node teste-home-dobra.mjs
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

/* Catálogo grande o bastante para a home montar tudo: destaques,
   ofertas e as seções de categoria. */
const CATALOGO = {
    produtos: Array.from({ length: 30 }, (_, i) => ({
        codigo: String(i + 1),
        ean: "789110600" + String(1000 + i),
        descricao: `Produto de Teste ${i + 1} 500mg`,
        precoVenda: "20.00",
        precoPromocao: i % 3 === 0 ? "16.00" : "",
        categoria: i % 2 ? "GENERICO" : "HIGIENE",
        estoque: 10
    }))
};

const navegador = await chromium.launch({ executablePath: process.env.CHROME_PATH });

async function abrir(largura, altura) {
    const contexto = await navegador.newContext({ viewport: { width: largura, height: altura } });
    const pagina = await contexto.newPage();

    await pagina.route(/produtos.*\.json|raw\.githubusercontent/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(CATALOGO)
    }));

    await pagina.goto(BASE + "/loja/mais-barato", { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(3500);

    return { pagina, contexto };
}

const medir = (pagina) => pagina.evaluate(() => {
    const topo = (s) => {
        const e = document.querySelector(s);
        return e ? Math.round(e.getBoundingClientRect().top + scrollY) : null;
    };

    const grudado = [".header", ".busca-container", ".filtros-wrap"]
        .map((s) => document.querySelector(s))
        .filter((e) => e && getComputedStyle(e).position === "sticky")
        .reduce((soma, e) => soma + e.getBoundingClientRect().height, 0);

    const primeiro = document.querySelector(".mais-vendidos .card-mini, #produtos .card");

    return {
        grudado: Math.round(grudado),
        teto: getComputedStyle(document.documentElement).getPropertyValue("--teto-grudado").trim(),
        destaques: topo(".mais-vendidos"),
        ofertas: topo(".banner"),
        primeiroProduto: primeiro
            ? Math.round(primeiro.getBoundingClientRect().top + scrollY)
            : null,
        cabecalho: (document.querySelector(".header") || {}).textContent || ""
    };
});

/* ---- 1. o celular --------------------------------------------------- */
console.log("\n1. a primeira tela de um celular de 390px");
{
    const { pagina, contexto } = await abrir(390, 844);
    const m = await medir(pagina);

    conferir(`o que fica grudado no topo cabe em 130px (era 215) — ${m.grudado}px`,
        m.grudado <= 130, String(m.grudado));

    conferir(`o primeiro produto aparece antes de 300px (era 441) — ${m.primeiroProduto}px`,
        m.primeiroProduto !== null && m.primeiroProduto < 300, String(m.primeiroProduto));

    /* Produto antes de anúncio. A tira de ofertas não se perdeu: ela
       continua inteira, logo abaixo da primeira fileira. */
    conferir("a tira de ofertas vem DEPOIS dos destaques",
        m.ofertas !== null && m.destaques !== null && m.ofertas > m.destaques,
        `destaques ${m.destaques} / ofertas ${m.ofertas}`);

    /* A medida publicada para o CSS tem de bater com a real: é ela que
       posiciona a barra de resultado, e uma conta errada aqui põe a
       barra por cima dos cards. */
    conferir(`o --teto-grudado acompanha a mudança — ${m.teto}`,
        m.teto === `${m.grudado}px`, `${m.teto} vs ${m.grudado}px`);

    /* Os emojis do cabeçalho eram o que mais denunciava "site gerado"
       na primeira tela. */
    conferir("nenhum emoji no cabeçalho",
        !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(m.cabecalho),
        JSON.stringify(m.cabecalho.replace(/\s+/g, " ").slice(0, 80)));

    /* O recado que valia a pena ficou — fora do que gruda. */
    const recado = pagina.locator(".recado-loja");
    conferir("a entrega em 2 horas continua na home",
        /2 horas/.test((await recado.textContent()) || ""), "recado sumiu");
    conferir("e ela sobe com a página, em vez de ocupar o topo",
        await recado.evaluate((e) => getComputedStyle(e).position) === "static");

    await contexto.close();
}

/* ---- 2. o computador ------------------------------------------------ */
console.log("\n2. no computador nada disso se aplica");
{
    const { pagina, contexto } = await abrir(1440, 900);
    const m = await medir(pagina);

    /* Lá os 215px são 24% de uma tela de 900 e cabem: as barras
       continuam grudadas, que é o comportamento que se quer num
       monitor. O risco desta mudança era vazar para o computador. */
    conferir("as barras continuam grudadas no computador",
        m.grudado > 150, String(m.grudado));

    conferir("e o primeiro produto continua perto do topo",
        m.primeiroProduto !== null && m.primeiroProduto < 500, String(m.primeiroProduto));

    /* A caixa de ofertas tem de PREENCHER a tela larga.

       Três itens numa tela de 1440 deixavam meia caixa vazia, e a
       primeira tentativa de arrumar (limitar a largura da fileira) só
       mudou o vazio de lugar. Quem resolve é a quantidade: onde cabe
       mais oferta, aparece mais oferta. */
    const porTela = await pagina.locator(".banner-slide.ativo .banner-item").count();
    conferir(`a tela larga mostra mais de 3 ofertas por vez — ${porTela}`,
        porTela > 3, String(porTela));

    /* E a fileira ocupa a caixa, em vez de se encolher num canto. */
    const ocupa = await pagina.evaluate(() => {
        const fileira = document.querySelector(".banner-slide.ativo .banner-grupo-itens");
        const caixa = document.querySelector(".banner-container");
        if (!fileira || !caixa) return 0;
        return fileira.getBoundingClientRect().width / caixa.getBoundingClientRect().width;
    });
    conferir(`e ocupa a largura da caixa — ${Math.round(ocupa * 100)}%`,
        ocupa > 0.8, String(ocupa));

    await contexto.close();
}

await navegador.close();

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

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

/* Um banner 1200x400, a proporção que a loja publica. Serve para medir
   a home como ela fica DE VERDADE: os banners subiram para logo abaixo
   dos atalhos, e sem um deles na medição o teste só veria a home de uma
   farmácia que nunca publicou campanha nenhuma. */
const BANNER_FALSO = "data:image/svg+xml;base64," + Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400">'
    + '<rect width="1200" height="400" fill="#26247B"/></svg>'
).toString("base64");

async function abrir(largura, altura, { comBanner = false } = {}) {
    const contexto = await navegador.newContext({ viewport: { width: largura, height: altura } });
    const pagina = await contexto.newPage();

    await pagina.route(/produtos.*\.json|raw\.githubusercontent/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(CATALOGO)
    }));

    await pagina.route(/farmatech-pedidos-proxy/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
            ok: true, loja: null, encarte: null,
            banners: comBanner ? [{ imagem: BANNER_FALSO, alt: "Campanha" }] : []
        })
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
        chips: topo(".filtros, .filtros-chips"),
        /* null quando a seção está com `hidden`: é assim que a medida
           distingue "sem banner" de "banner de altura zero". */
        promos: (() => {
            const e = document.querySelector("#promos");
            return (!e || e.hidden) ? null
                : Math.round(e.getBoundingClientRect().top + scrollY);
        })(),
        destaques: topo(".mais-vendidos"),
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

    /* O limite subiu de 300 para 460, e isso é mudança de projeto, não
       teste afrouxado para passar.

       A regra nasceu contra uma home que abria com 174px de anúncio e
       punha o primeiro produto em 441px — o cliente via três
       miniaturas de propaganda antes de ver uma farmácia. Os 300px
       eram a forma de dizer "produto primeiro".

       O que entrou entre o recado e os destaques não é anúncio: é a
       fileira de atalhos de categoria, a única porta para quem chega
       sem nome de produto na cabeça. O funil diz quem é essa pessoa —
       251 visitas, 84 buscas: 167 não digitaram nada, e para elas a
       home não tinha por onde começar.

       Então a regra passou a dizer o que realmente importa: o primeiro
       produto continua DENTRO da primeira tela de um celular (844px),
       com folga, e os atalhos vêm antes dele de propósito. Se alguém
       empilhar outra coisa aqui, o teste volta a reclamar. */
    conferir(`o primeiro produto aparece antes de 460px (era 441 antes da reforma) — ${m.primeiroProduto}px`,
        m.primeiroProduto !== null && m.primeiroProduto < 460, String(m.primeiroProduto));

    /* Era "os atalhos de categoria vêm antes do primeiro produto".

       A fileira de ladrilhos saiu da home: ela e os chips chamavam o
       mesmo data-acao="filtrar" com o mesmo data-familia, e no
       computador apareciam inteiras uma embaixo da outra — a farmácia
       viu e disse "as categorias aparecem 2x". A navegação com ícone
       foi para a folha da aba Categorias.

       O que o teste guardava continua valendo, só que agora sobre os
       chips: quem chega sem nome de produto na cabeça encontra por onde
       entrar ANTES de ver o primeiro preço. */
    conferir(`as categorias vêm antes do primeiro produto — ${m.chips}px`,
        m.chips !== null && m.primeiroProduto !== null && m.chips < m.primeiroProduto,
        `chips ${m.chips} / produto ${m.primeiroProduto}`);

    /* E uma fileira só. Esta asserção existe para a segunda não voltar
       sem querer, por exemplo num merge. */
    conferir("e são uma fileira só",
        await pagina.locator("#atalhos, .atalhos").count() === 0,
        "a fileira de ladrilhos voltou");

    /* O #promos nasce escondido: farmácia sem campanha publicada não
       ganha um buraco no alto da página. */
    conferir("sem banner publicado, a faixa não ocupa espaço",
        m.promos === null, String(m.promos));

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
    /* Era "/2 horas/". O prazo saiu: era promessa fixa de uma loja só,
       e nenhuma filial tem como garanti-la no dia do cadastro — prazo
       que o site promete e a entrega não cumpre volta como reclamação
       no WhatsApp. O que o teste guarda é o recado existir e ser sobre
       entrega; o prazo exato quem combina é a loja. */
    conferir("o recado de entrega continua na home",
        /entrega/i.test((await recado.textContent()) || ""), "recado sumiu");
    conferir("e ela sobe com a página, em vez de ocupar o topo",
        await recado.evaluate((e) => getComputedStyle(e).position) === "static");

    await contexto.close();
}

/* ---- 1b. a mesma tela, com a campanha da loja no ar ------------------ */
console.log("\n1b. com o banner da loja publicado");
{
    /* Esta é a home de verdade de uma farmácia que usa o painel. O
       banner subiu para logo abaixo dos atalhos — é a única peça da
       página que a loja escreve, e enterrada no meio ela não era vista.

       O preço é espaço, e é por isso que esta medida existe: o banner
       1200x400 ocupa 138px numa tela de 390, e empurra o primeiro
       produto junto. O limite de 620px é o que garante que o cartão
       ainda aparece na primeira tela de um celular de 844 — foto, nome
       e começo do preço — em vez de a home abrir só com propaganda e
       o cliente ter de rolar para descobrir que ali se vende alguma
       coisa. */
    const { pagina, contexto } = await abrir(390, 844, { comBanner: true });
    const m = await medir(pagina);

    conferir(`a faixa da loja aparece — ${m.promos}px`,
        m.promos !== null, String(m.promos));

    conferir("e vem antes dos destaques",
        m.promos !== null && m.destaques !== null && m.promos < m.destaques,
        `promos ${m.promos} / destaques ${m.destaques}`);

    conferir(`mesmo com o banner, o produto cabe na primeira tela — ${m.primeiroProduto}px`,
        m.primeiroProduto !== null && m.primeiroProduto < 620,
        String(m.primeiroProduto));

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

    /* As duas medidas que estavam aqui — quantas ofertas cabiam por
       tela larga e se a fileira preenchia a caixa — eram da tira
       "Ofertas do dia", que a loja mandou tirar do site. A fileira que
       ficou é a de destaques, que rola em vez de paginar, então não há
       "quantos cabem por tela" para medir. O que sobrou de válido dali
       é a asserção de cima: no computador o produto continua perto do
       topo. */

    await contexto.close();
}

await navegador.close();

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

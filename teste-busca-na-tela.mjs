/* Digitar e ver resposta.

   O que a loja viu, e que nenhum teste pegava: buscar "DIP" mostrava a
   chamada do encarte e um banner de parceiro de 400px, e o primeiro
   resultado caía abaixo da tela. O cliente digitava e não via produto
   nenhum — só propaganda.

   E a parte nova: a lista de sugestões, que deixa a pessoa tocar no
   nome em vez de digitar "Dipirona Sódica 500mg Com/10" inteiro.

   Uso:
     npx wrangler pages dev public --port 8821 --binding DOMINIO_PLATAFORMA=teste.local
     BASE=http://127.0.0.1:8821 CHROME_PATH=... node teste-busca-na-tela.mjs
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

const nomes = [
    "Dipirona Sódica 500mg Com/10", "Dipirona Gotas 20ml",
    "Paracetamol 750mg Com/20", "Protetor Solar FPS 50",
    "Shampoo Anticaspa 200ml", "Creme Dental 90g"
];

const CATALOGO = {
    produtos: Array.from({ length: 24 }, (_, i) => ({
        codigo: String(i + 1),
        ean: "789110600" + String(2000 + i),
        descricao: nomes[i % nomes.length] + (i >= nomes.length ? ` ${i}` : ""),
        marca: "EMS",
        precoVenda: "20.00",
        categoria: i % 2 ? "GENERICO" : "HIGIENE",
        estoque: 10
    }))
};

const navegador = await chromium.launch({ executablePath: process.env.CHROME_PATH });

async function abrir(largura = 390, altura = 844) {
    const contexto = await navegador.newContext({ viewport: { width: largura, height: altura } });
    const pagina = await contexto.newPage();

    await pagina.route(/produtos.*\.json|raw\.githubusercontent/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(CATALOGO)
    }));

    await pagina.goto(BASE + "/loja/mais-barato", { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(3000);

    return { pagina, contexto };
}

/* ---- 1. o resultado aparece onde dá para ver ------------------------ */
console.log("\n1. digitar e ver o resultado, sem rolar");
{
    const { pagina, contexto } = await abrir();

    await pagina.fill("#busca", "dip");
    await pagina.waitForTimeout(900);

    /* O que empurrava o resultado para fora da tela. Os dois têm estado
       próprio ("não há encarte publicado"), então o teste olha o que o
       cliente vê, não o atributo. */
    for (const alvo of ["#chamadaEncarte", "#promos"]) {
        const visivel = await pagina.locator(alvo).isVisible().catch(() => false);
        conferir(`${alvo} sai da tela durante a busca`, !visivel, "continua visível");
    }

    const topo = await pagina.evaluate(() => {
        const card = document.querySelector("#produtos .card");
        return card ? Math.round(card.getBoundingClientRect().top + scrollY) : null;
    });

    /* Sem rolar: numa tela de 844, o primeiro resultado tem de estar
       dentro dela. */
    conferir(`o primeiro resultado cabe na tela — ${topo}px`,
        topo !== null && topo < 500, String(topo));

    await contexto.close();
}

/* ---- 2. a lista de sugestões ---------------------------------------- */
console.log("\n2. as opções conforme as letras digitadas");
{
    const { pagina, contexto } = await abrir();

    /* Uma letra não é uma busca. */
    await pagina.type("#busca", "d", { delay: 30 });
    await pagina.waitForTimeout(300);
    conferir("com uma letra, nenhuma lista",
        !(await pagina.locator("#sugestoes").isVisible()), "lista aberta cedo demais");

    await pagina.type("#busca", "ip", { delay: 30 });
    await pagina.waitForTimeout(400);

    const lista = pagina.locator("#sugestoes .sugestao");
    const quantas = await lista.count();

    conferir(`a lista abre com as dipironas — ${quantas}`, quantas > 0 && quantas <= 6, String(quantas));

    const primeira = (await lista.first().textContent() || "").trim();
    conferir("e a primeira é uma dipirona", /Dipirona/i.test(primeira), primeira);

    /* O pedaço digitado vem grifado: é o que mostra por que aquela
       linha está ali. */
    const grifado = (await lista.first().locator("b").textContent() || "").trim();
    conferir("com o trecho digitado em destaque", /^dip$/i.test(grifado), grifado);

    /* Link de verdade: abre em nova aba, copia endereço, e funciona se
       o script falhar. */
    const href = await lista.first().getAttribute("href");
    conferir("cada sugestão é um link para a página do produto",
        /\/produto\/.+-\d{8,}$/.test(href || ""), String(href));

    /* Esc fecha: no celular, com o teclado aberto, não há "fora" onde
       tocar sem acertar um produto. */
    await pagina.keyboard.press("Escape");
    await pagina.waitForTimeout(200);
    conferir("Esc fecha a lista",
        !(await pagina.locator("#sugestoes").isVisible()), "continuou aberta");

    await contexto.close();
}

/* ---- 3. tocar numa sugestão ----------------------------------------- */
console.log("\n3. tocar na sugestão abre o produto");
{
    const { pagina, contexto } = await abrir();

    await pagina.fill("#busca", "parace");
    await pagina.waitForTimeout(400);

    const primeira = pagina.locator("#sugestoes .sugestao").first();
    const nome = (await primeira.textContent() || "").trim();

    await primeira.click();
    await pagina.waitForTimeout(2500);

    conferir("saiu da vitrine para a página do produto",
        /\/produto\//.test(pagina.url()), pagina.url());

    const titulo = (await pagina.textContent(".produto-nome, h1").catch(() => "")) || "";
    conferir("e é o produto que estava escrito na linha",
        /Paracetamol/i.test(titulo + nome), `${titulo} / ${nome}`);

    await contexto.close();
}

/* ---- 4. a vitrine volta inteira ------------------------------------- */
console.log("\n4. limpar a busca devolve a vitrine");
{
    const { pagina, contexto } = await abrir();

    /* O estado de ANTES, seja ele qual for. O encarte e os banners têm
       estado próprio ("há encarte publicado hoje?"), que depende do
       servidor e muda de um dia para o outro — a pergunta que vale é se
       a busca DEVOLVE a vitrine como ela estava, e não se um encarte
       específico existe. */
    const como = () => pagina.evaluate(() => {
        const visivel = (sel) => {
            const e = document.querySelector(sel);
            return !!e && !e.hidden && getComputedStyle(e).display !== "none";
        };
        return {
            destaques: visivel(".mais-vendidos"),
            atalhos: visivel("#atalhos"),
            encarte: visivel("#chamadaEncarte"),
            promos: visivel("#promos")
        };
    });

    const antes = await como();

    await pagina.fill("#busca", "dip");
    await pagina.waitForTimeout(900);

    const durante = await como();

    await pagina.fill("#busca", "");
    await pagina.waitForTimeout(900);

    const depois = await como();

    conferir("os destaques voltam", antes.destaques && depois.destaques,
        JSON.stringify({ antes, depois }));

    conferir("durante a busca, nenhum bloco da vitrine ocupa a tela",
        !durante.destaques && !durante.atalhos && !durante.encarte && !durante.promos,
        JSON.stringify(durante));

    /* Nem a mais nem a menos: a busca não pode ressuscitar um bloco
       vazio nem matar um que existia. */
    conferir("e a vitrine volta exatamente como estava",
        JSON.stringify(antes) === JSON.stringify(depois),
        `${JSON.stringify(antes)} vs ${JSON.stringify(depois)}`);

    await contexto.close();
}

await navegador.close();

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

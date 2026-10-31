/* Os nomes da barra de subcategoria, e quem manda neles.

   A barra nasceu mostrando o texto CRU que vem do PDV ou da lista da
   distribuidora. Medido no catálogo publicado: 284 rótulos, 64 deles só
   em Higiene Pessoal, com coisas como "Gener/Similar S/Gt", "Etico",
   "Fr Geriatrica", "Perf/Aplic/Afericao" e "Varejo". Código interno
   virando texto para o cliente.

   Três coisas passam a mandar nessa barra, e este arquivo guarda as
   três:

     1. o que a LOJA escreveu (painel → /referencias/subcategorias): o
        nome que o cliente lê e o que ela escondeu;

     2. a regra do rótulo que REPETE a família. Dentro de Higiene
        Pessoal havia um chip "Higiene Pessoal" com 1.201 de 1.201
        produtos — o "Todas" com outro nome. Some sozinho, sem a loja
        precisar esconder um por um;

     3. a junção por chave normalizada. "Creme De Tratamento" e "Creme
        Tratamento" eram dois chips para a mesma coisa.

   E a quarta, que é a que não pode falhar: sem o dicionário no ar, a
   barra volta a ser o que era — texto cru em Maiúsculas —, nunca vazia.

   Uso:
     npx wrangler pages dev public --port 8821
     BASE=http://127.0.0.1:8821 CHROME_PATH=... node teste-subfiltro-nomes.mjs
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

let seq = 0;
const item = (extra) => ({
    codigo: String(++seq),
    ean: "789" + String(1000000000 + seq),
    descricao: `Produto ${seq}`,
    marca: "ACME",
    precoVenda: 20,
    estoque: 10,
    imagem: "https://exemplo.invalido/foto.webp",
    ...extra
});

/* A família "Cabelo" do familias.js pega a categoria TINTURA; dentro
   dela, as subcategorias da lista da distribuidora. */
const CATALOGO = { produtos: [
    /* O par que a normalização tem de juntar: mesmo nome, espaço e
       caixa diferentes. */
    ...Array.from({ length: 6 }, () => item({ categoria: "TINTURA", subcategoria: "Creme De Tratamento" })),
    ...Array.from({ length: 4 }, () => item({ categoria: "TINTURA", subcategoria: "creme  tratamento" })),

    /* O que a loja vai renomear. */
    ...Array.from({ length: 9 }, () => item({ categoria: "TINTURA", subcategoria: "Gener/Similar S/Gt" })),

    /* O que a loja vai esconder. */
    ...Array.from({ length: 7 }, () => item({ categoria: "TINTURA", subcategoria: "Varejo" })),

    /* O rótulo que REPETE o nome da família — tem de sumir sozinho. */
    ...Array.from({ length: 30 }, () => item({ categoria: "TINTURA", subcategoria: "Cabelo" }))
] };

const DICIONARIO = {
    versao: 1,
    rotulos: {
        "gener/similar s/gt": { nome: "Genéricos e similares" },
        "varejo": { oculto: true }
    }
};

const navegador = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);

async function abrir({ dicionario = DICIONARIO } = {}) {
    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
    const pagina = await contexto.newPage();

    await pagina.route(/farmatech-pedidos-proxy/, (rota) => rota.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ banners: [], promocoes: [], cupons: [] })
    }));

    await pagina.route(/referencias\/subcategorias/, (rota) => rota.fulfill(
        dicionario === null
            ? { status: 500, body: "" }
            : {
                status: 200, contentType: "application/json",
                headers: { "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify(dicionario)
            }
    ));

    await pagina.route(/raw\.githubusercontent|produtos.*\.json/, (rota) => rota.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(CATALOGO)
    }));

    await pagina.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await pagina.waitForTimeout(2500);
    await pagina.keyboard.press("Escape").catch(() => {});

    /* Entra na família: a barra de subfiltro só existe dentro de uma. */
    await pagina.click('[data-acao="filtrar"][data-familia="cabelo"]');
    await pagina.waitForTimeout(900);

    return { pagina, contexto };
}

const chips = (pagina) =>
    pagina.$$eval("#subfiltros button", (bs) => bs.map((b) => b.textContent.trim()));

/* ---- 1. o que a loja escreveu ---------------------------------------- */
console.log("\n1. o nome que a loja escreveu é o que aparece");
{
    const { pagina, contexto } = await abrir();
    const lista = await chips(pagina);

    conferir("o jargão foi substituído",
        lista.includes("Genéricos e similares"), JSON.stringify(lista));

    conferir("e o texto cru não aparece mais",
        !lista.some((c) => /Gener\/Similar/i.test(c)), JSON.stringify(lista));

    /* Esconder é diferente de renomear: o produto continua na lista da
       família, só não ganha um chip. */
    conferir("o que ela escondeu sumiu da barra",
        !lista.some((c) => /Varejo/i.test(c)), JSON.stringify(lista));

    await contexto.close();
}

/* ---- 2. o rótulo que repete a família -------------------------------- */
console.log("\n2. o chip que não filtra nada some sozinho");
{
    const { pagina, contexto } = await abrir();
    const lista = await chips(pagina);

    /* "Cabelo" dentro de Cabelo seria o maior chip da barra (30 de 56
       produtos) e não filtraria nada que o "Todas" já não mostre. A
       loja não deveria ter de escondê-lo à mão em cada família. */
    conferir("'Cabelo' não vira chip dentro de Cabelo",
        !lista.some((c) => c === "Cabelo"), JSON.stringify(lista));

    conferir("e o 'Todas' continua lá",
        lista.includes("Todas"), JSON.stringify(lista));

    await contexto.close();
}

/* ---- 3. a junção por chave normalizada ------------------------------- */
console.log("\n3. duas grafias, um chip");
{
    const { pagina, contexto } = await abrir();
    const lista = await chips(pagina);

    const tratamento = lista.filter((c) => /creme\s+(de\s+)?tratamento/i.test(c));
    conferir("'Creme De Tratamento' e 'creme  tratamento' viram um só",
        tratamento.length === 1, JSON.stringify(tratamento));

    /* E o chip tem de levar os DOIS: clicar nele e receber só 6 dos 10
       seria pior que os dois chips separados. */
    await pagina.click('[data-acao="filtrar-sub"]:not([data-subcategoria="todas"])');
    await pagina.waitForTimeout(700);

    const ativo = await pagina.locator("#subfiltros button.ativo").textContent();
    if (/creme/i.test(ativo || "")) {
        const n = await pagina.locator("#produtos .card").count();
        conferir(`e o chip leva os 10 produtos das duas grafias — ${n}`,
            n === 10, String(n));
    } else {
        /* A ordem é por quantidade; se o primeiro não for o creme, o
           teste não tem o que medir aqui e diz isso em vez de passar
           de graça. */
        conferir("o primeiro chip era o creme", false, ativo);
    }

    await contexto.close();
}

/* ---- 4. sem o dicionário no ar --------------------------------------- */
console.log("\n4. servidor do dicionário fora");
{
    const { pagina, contexto } = await abrir({ dicionario: null });
    const lista = await chips(pagina);

    /* A asserção que importa: a barra NÃO pode sumir nem ficar vazia.
       Ela volta a ser o que era antes desta mudança. */
    conferir("a barra continua de pé", lista.length >= 3, JSON.stringify(lista));

    conferir("com o texto cru em Maiúsculas",
        lista.some((c) => /Gener\/Similar S\/Gt/i.test(c)), JSON.stringify(lista));

    /* E a regra da família, que é do código e não do dicionário,
       continua valendo mesmo sem servidor. */
    conferir("e 'Cabelo' continua fora, porque isso é regra do código",
        !lista.some((c) => c === "Cabelo"), JSON.stringify(lista));

    await contexto.close();
}

/* ---- 5. a barra some quando não resta filtro ------------------------- */
console.log("\n5. um chip só não é filtro");
{
    /* Escondendo tudo menos um, sobra "Todas" + um — que não filtra
       nada. A barra inteira sai, em vez de ficar ocupando altura. */
    const { pagina, contexto } = await abrir({
        dicionario: {
            versao: 1,
            rotulos: {
                "varejo": { oculto: true },
                "gener/similar s/gt": { oculto: true },
                "creme de tratamento": { oculto: true },
                "creme tratamento": { oculto: true }
            }
        }
    });

    const visivel = await pagina.locator("#subfiltros").isVisible().catch(() => false);
    conferir("a barra não aparece", !visivel, JSON.stringify(await chips(pagina)));

    await contexto.close();
}

/* ---- 6. o teto de oito ------------------------------------------------ */
console.log("\n6. a barra não passa de oito chips");
{
    /* Doze rótulos numa família só — o catálogo real tem 61 em Higiene
       Pessoal e 93 em Outros. Nenhuma quantidade de renomear conserta
       uma barra assim; o teto é o que a faz existir. */
    const MUITOS = { produtos: Array.from({ length: 12 }).flatMap((_, i) =>
        Array.from({ length: 20 - i }, () => item({ categoria: "TINTURA", subcategoria: `Tipo ${i + 1}` }))
    ) };

    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
    const pagina = await contexto.newPage();

    await pagina.route(/farmatech-pedidos-proxy/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" }, body: "{}" }));
    await pagina.route(/referencias\/subcategorias/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ versao: 1, rotulos: { "tipo 1": { oculto: true } } }) }));
    await pagina.route(/raw\.githubusercontent|produtos.*\.json/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(MUITOS) }));

    await pagina.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await pagina.waitForTimeout(2500);
    await pagina.keyboard.press("Escape").catch(() => {});
    await pagina.click('[data-acao="filtrar"][data-familia="cabelo"]');
    await pagina.waitForTimeout(900);

    const lista = await chips(pagina);

    /* Oito chips mais o "Todas". */
    conferir(`nove botões no total, não treze — ${lista.length}`,
        lista.length === 9, JSON.stringify(lista));

    /* E são os MAIORES: Tipo 1 tinha 20 produtos mas foi escondido pela
       loja, então entram do Tipo 2 ao Tipo 9. */
    conferir("o escondido pela loja não entra",
        !lista.includes("Tipo 1"), JSON.stringify(lista));

    /* A asserção que descreve a regra: esconder o primeiro PROMOVE o
       nono. É assim que a loja escolhe quais oito aparecem, sem uma
       tela de ordenação. */
    conferir("e o nono sobe no lugar dele",
        lista.includes("Tipo 9"), JSON.stringify(lista));

    conferir("o décimo continua de fora",
        !lista.includes("Tipo 10"), JSON.stringify(lista));

    await contexto.close();
}

await navegador.close();

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

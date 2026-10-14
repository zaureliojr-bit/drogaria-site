/* Abre a página de produto num navegador de verdade e confere o que o
   cliente vê. É o teste que faltava na vez do CSP do painel: lá eu servi
   os arquivos por nome, o Cloudflare redirecionava /painel.html para
   /painel, e o teste passou enquanto o site estava quebrado.

   Por isso aqui a página vem do `wrangler pages dev`, que aplica as
   mesmas regras da Pages: a função, o _headers e o redirecionamento do
   .html.

   O que está sendo provado, em ordem de importância:

     1. a folha de estilo e os três scripts carregam num endereço de
        DUAS barras (/produto/nome-ean) — é aqui que um href relativo
        pediria /produto/style.css e a tela sairia pelada;
     2. o produto certo aparece, achado pelo EAN do caminho;
     3. o <title> que o servidor escreveu é trocado pelo nome com acento
        quando o catálogo chega;
     4. o link antigo (?codigo=) continua abrindo o mesmo produto;
     5. nenhum ícone do sprite se perdeu;
     6. nada foi bloqueado pelo CSP.

   Uso:
     npx wrangler pages dev public --port 8799 &
     node teste-pagina-produto.mjs
*/

import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:8799";

/* O produto usado nos testes. Tem acento no nome de verdade? Não: o
   catálogo do PDV escreve "Limao". O acento é testado à parte, na
   seção 3, com um produto que tem. */
const EAN = "7891106000888";
const SLUG = "aspirina-c-efervescente-limao-display-c-50x2-comprimidos";

let falhas = 0;
function conferir(descricao, condicao, detalhe = "") {
    if (condicao) console.log(`  ok   ${descricao}`);
    else {
        console.log(`  FALHA ${descricao}${detalhe ? "  → " + detalhe : ""}`);
        falhas++;
    }
}

/* O Chromium já está na máquina, mas a versão do pacote playwright não é
   sempre a mesma que baixou aquele navegador — e então o launch() procura
   uma pasta que não existe. CHROME_PATH aponta o executável na mão. */
const navegador = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);

/* Um contexto só para o teste inteiro, e não uma aba isolada por seção.

   Motivo prático: o catálogo tem 2,6 MB e não cabe no sessionStorage, de
   modo que cada aba nova o baixa outra vez. Em contexto compartilhado o
   cache HTTP do navegador atende da segunda vez em diante — que é, aliás,
   o que acontece com o cliente de verdade navegando pela loja. Em abas
   isoladas o teste chegou a estourar 90 s de espera por download, e
   acusava defeito onde havia só relógio. */
const contexto = await navegador.newContext();

async function abrir(caminho) {
    const pagina = await contexto.newPage();
    const quebrados = [];
    const bloqueados = [];
    const erros = [];

    pagina.on("requestfailed", (r) => {
        const u = r.url();
        if (new URL(u).origin === new URL(BASE).origin) quebrados.push(u + " — " + (r.failure()?.errorText || ""));
    });
    pagina.on("response", (r) => {
        const u = r.url();
        if (new URL(u).origin === new URL(BASE).origin && r.status() >= 400) quebrados.push(`${r.status()} ${u}`);
    });
    pagina.on("console", (m) => {
        const t = m.text();
        if (/Content Security Policy|Refused to/i.test(t)) bloqueados.push(t);
        if (m.type() === "error") erros.push(t);
    });

    await pagina.goto(BASE + caminho, { waitUntil: "domcontentloaded" });
    return { pagina, quebrados, bloqueados, erros };
}

console.log(`\nservidor: ${BASE}`);

/* ---- 1 e 2: a página de endereço novo -------------------------------- */
console.log(`\n1. /produto/${SLUG.slice(0, 30)}…-${EAN}`);
{
    const { pagina, quebrados, bloqueados, erros } = await abrir(`/produto/${SLUG}-${EAN}`);

    const tituloServidor = await pagina.title();
    conferir(
        "o servidor já escreveu o nome no título, antes de qualquer script",
        /Aspirina/i.test(tituloServidor),
        tituloServidor
    );

    /* A folha de estilo: se tivesse sido pedida em /produto/style.css, o
       404 apareceria na lista de quebrados. Confere pelos dois lados —
       a requisição E o efeito visual. */
    const temCss = await pagina.evaluate(() => {
        const h = document.querySelector("header.header");
        return h ? getComputedStyle(h).display !== "block" || getComputedStyle(h).position !== "static" : false;
    });
    conferir("a folha de estilo foi aplicada", temCss);

    /* As três declarações são `const` no topo de cada arquivo, e `const`
       global NÃO vira propriedade de window — procurar em window daria
       "undefined" com os scripts carregados perfeitamente. O typeof solto
       enxerga o escopo léxico global, que é onde elas estão. */
    const scripts = await pagina.evaluate(() =>
        [typeof FAMILIAS, typeof produtos, typeof initProdutoPage]
    );
    conferir("familias.js, script.js e produto.js carregaram", !scripts.includes("undefined"), JSON.stringify(scripts));

    /* O catálogo vem do GitHub e tem 2,6 MB, e não cabe no sessionStorage
       — cada aba baixa o seu. Daí os 90 s de paciência: num teste que
       abre sete páginas em sequência, 40 s dava falha por relógio, não
       por defeito. */
    await pagina.waitForSelector("h1.produto-nome", { timeout: 90000 });

    const nome = (await pagina.textContent("h1.produto-nome")).trim();
    conferir("achou o produto pelo EAN do caminho", /Aspirina/i.test(nome), nome);

    const preco = (await pagina.textContent(".produto-preco-box")).replace(/\s+/g, " ").trim();
    conferir("o preço veio do catálogo", /\d/.test(preco), preco);

    const dados = await pagina.evaluate(() => {
        const blocos = [...document.querySelectorAll('script[type="application/ld+json"]')]
            .map((s) => JSON.parse(s.textContent));
        return blocos.map((b) => b["@type"]);
    });
    conferir("dado estruturado: trilha do servidor + produto do cliente",
        dados.includes("BreadcrumbList") && dados.includes("Product"), JSON.stringify(dados));

    const oferta = await pagina.evaluate(() => {
        const b = [...document.querySelectorAll('script[type="application/ld+json"]')]
            .map((s) => JSON.parse(s.textContent)).find((x) => x["@type"] === "Product");
        return b && b.offers;
    });
    conferir("a oferta tem preço e moeda", !!(oferta && oferta.price && oferta.priceCurrency === "BRL"),
        JSON.stringify(oferta));

    const icones = await pagina.evaluate(() => {
        const usos = [...document.querySelectorAll("use")];
        const ids = new Set([...document.querySelectorAll("symbol[id]")].map((s) => s.id));
        return usos.map((u) => u.getAttribute("href")).filter((h) => !h || !h.startsWith("#") || !ids.has(h.slice(1)));
    });
    conferir("nenhum ícone do sprite se perdeu", icones.length === 0, JSON.stringify(icones.slice(0, 5)));

    conferir("nada bloqueado pelo CSP", bloqueados.length === 0, bloqueados.slice(0, 3).join(" | "));
    conferir("nenhum arquivo do site faltou", quebrados.length === 0, quebrados.slice(0, 5).join(" | "));
    conferir("sem erro de JavaScript", erros.length === 0, erros.slice(0, 3).join(" | "));

    await pagina.close();
}

/* ---- 3: o título ganha o acento quando o catálogo chega -------------- */
console.log("\n2. o nome com acento substitui o do servidor");
{
    /* "Bismu-Jet SoluçãO Gts 20ml" → slug sem cedilha e sem til. O
       servidor só sabe escrever "Solucao"; o produto.js corrige. */
    const { pagina } = await abrir("/produto/bismu-jet-solucao-gts-20ml-7896004810140");

    const doServidor = await pagina.title();
    conferir("o servidor escreve sem acento", /Solucao/.test(doServidor), doServidor);

    /* Espera do lado do Node, com pagina.title() em laço, e não com
       pagina.waitForFunction(): o waitForFunction injeta a condição na
       página por eval, e o nosso CSP não tem 'unsafe-eval' — a espera
       morria com EvalError, que o catch mostrava como "título não
       mudou". O CSP estar barrando isso é, aliás, o comportamento
       desejado em produção.

       O normalize("NFC") é necessário: o catálogo vem do PDV em NFD, onde
       "ç" são dois caracteres (c + cedilha combinante), e a classe [çã]
       escrita em NFC não casaria com ele. */
    let corrigido = "";
    for (let i = 0; i < 180 && !/[çã]/.test(corrigido.normalize("NFC")); i++) {
        await pagina.waitForTimeout(500);
        corrigido = await pagina.title();
    }

    if (/[çã]/.test(corrigido.normalize("NFC"))) {
        conferir("o cliente corrige com o acento", true, corrigido);
    } else {
        /* Pode falhar legitimamente: este EAN é de exemplo e talvez não
           esteja mais no catálogo. Diz isso em vez de acusar o código. */
        const achou = await pagina.$("h1.produto-nome");
        conferir("o cliente corrige com o acento", false,
            achou ? "título não mudou: " + corrigido : "este EAN não está no catálogo de hoje");
    }

    await pagina.close();
}

/* ---- 4: o link antigo ----------------------------------------------- */
console.log("\n3. links antigos continuam abrindo");
for (const caminho of ["/produto.html?codigo=000001", "/produto?codigo=000001"]) {
    const { pagina, quebrados } = await abrir(caminho);
    try {
        await pagina.waitForSelector("h1.produto-nome", { timeout: 90000 });
        const nome = (await pagina.textContent("h1.produto-nome")).trim();
        conferir(`${caminho} abre o produto`, nome.length > 3, nome);
    } catch {
        conferir(`${caminho} abre o produto`, false, "não renderizou");
    }
    conferir(`${caminho} sem arquivo faltando`, quebrados.length === 0, quebrados.slice(0, 3).join(" | "));
    await pagina.close();
}

/* ---- 5: endereço inventado ------------------------------------------ */
console.log("\n4. endereço que não existe não vira tela de erro do navegador");
{
    const { pagina } = await abrir("/produto/isso-nao-existe-99999999999999");
    await pagina.waitForTimeout(3000);
    const corpo = await pagina.textContent("body");
    conferir("mostra aviso dentro do site", /n[ãa]o encontrad|n[ãa]o foi poss[íi]vel/i.test(corpo),
        corpo.replace(/\s+/g, " ").slice(0, 120));
    await pagina.close();
}

/* ---- 6: o card da home aponta para o endereço novo ------------------ */
console.log("\n5. os links da vitrine usam o endereço novo");
{
    const { pagina } = await abrir("/");
    /* Sem busca e sem família escolhida, a home não mostra a grade:
       mostra as seções de destaque, montadas com cardMiniHTML. Então o
       seletor é o do link, sem exigir o card grande. */
    await pagina.waitForSelector(".produto-nome-link", { timeout: 90000 });
    const hrefs = await pagina.evaluate(() =>
        [...document.querySelectorAll(".produto-nome-link")].slice(0, 20).map((a) => a.getAttribute("href"))
    );
    const bons = hrefs.filter((h) => /^\/produto\/[a-z0-9-]*\d{8,14}$/.test(h));
    conferir(`${bons.length} de ${hrefs.length} cards com endereço por nome`, bons.length === hrefs.length,
        hrefs.filter((h) => !bons.includes(h)).slice(0, 3).join(" | "));

    /* E o link realmente abre: clicar é o que prova que o endereço
       gerado e o lido pelo servidor são o mesmo. */
    await pagina.click(".produto-nome-link");
    await pagina.waitForSelector("h1.produto-nome", { timeout: 90000 });
    conferir("clicar no card abre a página do produto", /\/produto\//.test(pagina.url()), pagina.url());
    await pagina.close();
}

await navegador.close();
console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

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
    /* Esta seção visita a página CANÔNICA, sem loja — e lá a oferta é
       uma faixa de preços (AggregateOffer), não uma oferta de vendedor.
       A seção 6 cobre a diferença entre as duas rotas. */
    const valor = oferta && (oferta.price || oferta.lowPrice);
    conferir("a oferta tem preço e moeda", !!(valor && oferta.priceCurrency === "BRL"),
        JSON.stringify(oferta));

    const icones = await pagina.evaluate(() => {
        const usos = [...document.querySelectorAll("use")];
        const ids = new Set([...document.querySelectorAll("symbol[id]")].map((s) => s.id));
        return usos.map((u) => u.getAttribute("href")).filter((h) => !h || !h.startsWith("#") || !ids.has(h.slice(1)));
    });
    conferir("nenhum ícone do sprite se perdeu", icones.length === 0, JSON.stringify(icones.slice(0, 5)));

    conferir("nada bloqueado pelo CSP", bloqueados.length === 0, bloqueados.slice(0, 3).join(" | "));
    conferir("nenhum arquivo do site faltou", quebrados.length === 0, quebrados.slice(0, 5).join(" | "));
    /* Um 401 em /loja tem causa conhecida: o worker publicado ainda não
       tem a rota (Fase 2), então a chamada cai no porteiro do painel. O
       site não perde nada — o rodapé já traz os dados —, mas o navegador
       registra o erro. A asserção continua falhando de propósito: é
       lembrete de que falta publicar o worker, e some sozinha quando ele
       for. Se este texto ainda estiver aqui com o worker publicado, aí é
       regressão de verdade. */
    const aguardandoWorker = erros.length > 0 && erros.every((e) => /401/.test(e));
    conferir("sem erro de JavaScript", erros.length === 0,
        (aguardandoWorker ? "(worker ainda sem a rota /loja) " : "") + erros.slice(0, 3).join(" | "));

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
    /* O card aponta para a página de COMPRA, com a loja no caminho — é
       nela que há preço e botão. A canônica, sem loja, é a que o sitemap
       publica e a que o Google mostra. */
    const bons = hrefs.filter((h) => /^\/loja\/[a-z0-9-]+\/produto\/[a-z0-9-]*\d{8,14}$/.test(h));
    conferir(`${bons.length} de ${hrefs.length} cards apontam para a página de compra da loja`,
        bons.length === hrefs.length,
        hrefs.filter((h) => !bons.includes(h)).slice(0, 3).join(" | "));

    /* E o link realmente abre: clicar é o que prova que o endereço
       gerado e o lido pelo servidor são o mesmo. */
    await pagina.click(".produto-nome-link");
    await pagina.waitForSelector("h1.produto-nome", { timeout: 90000 });
    conferir("clicar no card abre a página do produto", /\/produto\//.test(pagina.url()), pagina.url());
    await pagina.close();
}

/* ---- 6: as duas rotas do marketplace -------------------------------- */
console.log("\n6. as duas rotas: a do produto e a da loja");
{
    const caminhoProduto = `/produto/${SLUG}-${EAN}`;
    const caminhoLoja = `/loja/mais-barato/produto/${SLUG}-${EAN}`;

    const ler = async (caminho) => {
        const { pagina } = await abrir(caminho);
        const cabeca = await pagina.evaluate(() => ({
            titulo: document.title,
            canonico: document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
            ogUrl: document.querySelector('meta[property="og:url"]')?.getAttribute("content"),
            robots: document.querySelector('meta[name="robots"]')?.getAttribute("content") || ""
        }));
        await pagina.waitForSelector("h1.produto-nome", { timeout: 90000 });
        const oferta = await pagina.evaluate(() => {
            const b = [...document.querySelectorAll('script[type="application/ld+json"]')]
                .map((s) => JSON.parse(s.textContent)).find((x) => x["@type"] === "Product");
            return b && b.offers;
        });
        await pagina.close();
        return { ...cabeca, oferta };
    };

    const doProduto = await ler(caminhoProduto);
    const daLoja = await ler(caminhoLoja);

    const canonicoEsperado = new URL(caminhoProduto, BASE).toString();

    conferir("a página do produto é canônica de si mesma",
        doProduto.canonico === canonicoEsperado, doProduto.canonico);
    conferir("a página da loja aponta para a do produto",
        daLoja.canonico === canonicoEsperado, daLoja.canonico);
    conferir("e o og:url de cada uma é o endereço dela mesma",
        doProduto.ogUrl !== daLoja.ogUrl, `${doProduto.ogUrl} vs ${daLoja.ogUrl}`);

    /* noindex junto com canonical são instruções que se contradizem, e o
       Google avisa que pode acabar tirando as duas páginas. O canonical
       sozinho já consolida. */
    conferir("a página da loja NÃO leva noindex", !/noindex/.test(daLoja.robots), daLoja.robots);

    conferir("a loja declara uma oferta com vendedor",
        daLoja.oferta && daLoja.oferta["@type"] === "Offer" && !!daLoja.oferta.seller,
        JSON.stringify(daLoja.oferta));
    conferir("a do produto declara faixa de preços, sem vendedor",
        doProduto.oferta && doProduto.oferta["@type"] === "AggregateOffer" && !doProduto.oferta.seller,
        JSON.stringify(doProduto.oferta));
    conferir("as duas abrem o mesmo produto",
        /Aspirina/i.test(doProduto.titulo) && /Aspirina/i.test(daLoja.titulo),
        `${doProduto.titulo} | ${daLoja.titulo}`);
}

/* ---- 7: a vitrine da farmácia --------------------------------------- */
console.log("\n7. a vitrine da farmácia, em /loja/<slug>");
{
    const { pagina, quebrados } = await abrir("/loja/mais-barato");

    const cabeca = await pagina.evaluate(() => {
        const blocos = [...document.querySelectorAll('script[type="application/ld+json"]')]
            .map((s) => { try { return JSON.parse(s.textContent); } catch { return null; } })
            .filter(Boolean);
        return {
            titulo: document.title,
            canonico: document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
            farmacia: blocos.find((b) => b["@type"] === "Pharmacy")
        };
    });

    conferir("o título traz a farmácia e a cidade",
        /Drogaria Mais Barato/.test(cabeca.titulo) && /São Bernardo/.test(cabeca.titulo), cabeca.titulo);
    conferir("é canônica de si mesma",
        (cabeca.canonico || "").endsWith("/loja/mais-barato"), cabeca.canonico);
    conferir("declara Pharmacy com endereço",
        !!(cabeca.farmacia && cabeca.farmacia.address && cabeca.farmacia.address.addressLocality),
        JSON.stringify(cabeca.farmacia && cabeca.farmacia.address));
    conferir("e com horário de funcionamento",
        (cabeca.farmacia?.openingHoursSpecification || []).length === 7,
        String((cabeca.farmacia?.openingHoursSpecification || []).length));
    conferir("nenhum arquivo do site faltou", quebrados.length === 0, quebrados.slice(0, 3).join(" | "));

    await pagina.close();
}

await navegador.close();
console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

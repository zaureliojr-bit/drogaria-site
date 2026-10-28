/* O filtro de tarja da lista "Produtos sem imagem", e o catálogo que o
   painel olha para montá-la.

   A farmácia pediu um filtro só dos MIPs: nos de venda livre a foto de
   verdade ajuda a vender, e nos tarjados a caixa neutra é a escolha
   certa — vitrine aberta ao público não anuncia medicamento de
   prescrição com a embalagem (RDC 96/2008). Sem o filtro, "318 produtos
   sem imagem" se lê como 318 fotos faltando, quando a maior parte não
   deve mesmo ter foto.

   Antes disso, um defeito que apareceu ao montar o filtro: carregarCatalogo
   buscava SEMPRE o produtos.json da primeira loja. Na filial de Prudente
   a lista "sem imagem" mostrava os buracos de São Bernardo — e a aba
   Promoções decidia desconto em cima de preço e estoque de outra cidade.
   Com o filtro em pé, isso viraria "os MIPs sem foto da loja errada".

   E a terceira peça: a tarja nem sempre está no catálogo. A loja
   publicada sem a lista da CMED carregada sai sem o campo `tarja` — é o
   caso de Prudente hoje, 6.571 produtos e nenhum com tarja. O tarjas.json
   cobre esse buraco, e o filtro tem de enxergar pelos dois.

   Uso:
     npx wrangler pages dev public --port 8821
     BASE=http://127.0.0.1:8821 CHROME_PATH=... node teste-painel-fotos-tarja.mjs
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

const CATALOGO_DA_LOJA =
    "https://raw.githubusercontent.com/zaureliojr-bit/Produtos/refs/heads/main/produtos-prudente-01.json";
const CATALOGO_PADRAO =
    "https://raw.githubusercontent.com/zaureliojr-bit/Produtos/refs/heads/main/produtos.json";

/* O catálogo DESTA loja. Repare que só o primeiro traz o campo `tarja`:
   os outros são o caso de Prudente, publicado sem a CMED — a tarja deles
   só existe no tarjas.json. */
const PRODUTOS_DA_LOJA = { produtos: [
    { codigo: "1", ean: "7891000000001", descricao: "DIPIRONA 500MG 10CP", marca: "NEO", categoria: "GENERICO", precoVenda: 9.9, estoque: 5, tarja: "L" },
    { codigo: "2", ean: "7891000000002", descricao: "NEOSALDINA 30DRG", marca: "TAKEDA", categoria: "MEDICAMENTO", precoVenda: 24.5, estoque: 3 },
    { codigo: "3", ean: "7891000000003", descricao: "LOSARTANA 50MG 30CP", marca: "EMS", categoria: "GENERICO", precoVenda: 12.0, estoque: 7 },
    { codigo: "4", ean: "7891000000004", descricao: "SENSODYNE 90G", marca: "GSK", categoria: "HIGIENE", precoVenda: 18.9, estoque: 10 },
    { codigo: "5", ean: "7891000000005", descricao: "PROTETOR SOLAR FPS50", marca: "NIVEA", categoria: "DERMO", precoVenda: 49.9, estoque: 2,
      imagem: "https://imagens.example/ja-tem.jpg" }
] };

/* O catálogo da PRIMEIRA loja, que é o que o painel buscava antes. Se
   alguma asserção abaixo encostar neste produto, o defeito voltou. */
const PRODUTOS_DE_OUTRA_LOJA = { produtos: [
    { codigo: "99", ean: "7899999999999", descricao: "PRODUTO DE SAO BERNARDO", marca: "X", categoria: "GENERICO", precoVenda: 1, estoque: 1 }
] };

const TARJAS = {
    fonte: "CMED - teste",
    tarjas: {
        L: [7891000000002],              // Neosaldina: venda livre, sem tarja no catálogo
        V: [7891000000003],              // Losartana: tarja vermelha
        P: [],
        R: []
    }
};

/* A listagem da distribuidora tem foto de três: um MIP, um tarjado e uma
   higiene. O "Procurar" deve trazer dois e pular o tarjado. */
const DPC = {
    totalLinhas: 3,
    importadoEm: "2026-10-11T12:00:00.000Z",
    porEan: {
        "7891000000002": { descricao: "NEOSALDINA", imagem: "https://dpc.example/neo.jpg" },
        "7891000000003": { descricao: "LOSARTANA", imagem: "https://dpc.example/losartana.jpg" },
        "7891000000004": { descricao: "SENSODYNE", imagem: "https://dpc.example/sensodyne.jpg" }
    }
};

const navegador = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);

async function abrirPainel({ comBundle = true } = {}) {

    const contexto = await navegador.newContext();
    const pagina = await contexto.newPage();
    const buscados = [];
    const salvos = [];

    /* O "Aplicar" pergunta antes de gravar centenas de fotos, e o
       Playwright dispensa diálogo sozinho — sem isto o teste mediria o
       cancelamento, não a gravação. */
    pagina.on("dialog", (d) => d.accept());

    /* O porteiro inteiro num handler só: a rota /loja vem com query
       string (?slug=...), e um glob que termine em "/loja" não casa
       quando há query — já custou um teste antes. */
    await pagina.route("**/farmatech-pedidos-proxy*/**", async (rota) => {

        const url = new URL(rota.request().url());
        buscados.push(url.pathname);

        const responder = (dados, status = 200) => rota.fulfill({
            status, contentType: "application/json",
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(dados)
        });

        if (url.pathname === "/sessao") {
            return responder({ dono: false, loja: { slug: "prudente-01", nome: "Mais Barato Prudente", temSenhaPropria: true } });
        }
        if (url.pathname === "/loja") {
            return responder({ loja: { slug: "prudente-01", nome: "Mais Barato Prudente" }, catalogo: CATALOGO_DA_LOJA });
        }
        if (url.pathname === "/fila") return responder({ pedidos: [], abertos: ["novo"] });
        if (url.pathname === "/banners/todos") return responder({ banners: [], podeEnviarArquivo: false });
        if (url.pathname === "/promocoes/todas") return responder({ promocoes: [], lotes: [] });
        if (url.pathname === "/encartes") return responder({ encartes: [], podeEnviarArquivo: false });
        if (url.pathname.startsWith("/catalogo")) return responder({ pendente: false });

        return responder({ erro: "Rota não encontrada." }, 404);
    });

    await pagina.route("**/raw.githubusercontent.com/**", async (rota) => {
        const url = rota.request().url();
        buscados.push(url);
        return rota.fulfill({
            status: 200, contentType: "application/json",
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(url.includes("produtos-prudente-01")
                ? PRODUTOS_DA_LOJA : PRODUTOS_DE_OUTRA_LOJA)
        });
    });

    /* O tarjas.json é do próprio site, então o servidor de teste serve
       o ARQUIVO DE VERDADE, com 26 mil EANs — nenhum deles de mentira.
       Sem esta rota, o filtro não classificaria nada e as asserções
       passariam a medir o arquivo real em vez do código. */
    await pagina.route("**/tarjas.json", async (rota) => rota.fulfill({
        status: 200, contentType: "application/json", body: JSON.stringify(TARJAS)
    }));

    /* O bundle headless mora no domínio do padronizador. Aqui ele é um
       módulo de mentira, com as duas funções que a tela usa — assim o
       teste mede a DECISÃO do painel (quem entra na fila) sem depender
       de rede nem de um deploy. */
    await pagina.route("**/importador-automatico.js", async (rota) => {
        if (!comBundle) return rota.fulfill({ status: 404, body: "" });
        return rota.fulfill({
            status: 200,
            contentType: "application/javascript",
            headers: { "Access-Control-Allow-Origin": "*" },
            body: `
                const DPC = ${JSON.stringify(DPC)};
                export async function imagensDaDistribuidora() {
                    return {
                        total: DPC.totalLinhas,
                        importadoEm: DPC.importadoEm,
                        imagemDe(ean) {
                            const d = DPC.porEan[String(ean)];
                            return d && d.imagem ? d.imagem : null;
                        }
                    };
                }
                export async function salvarImagemDaDistribuidora(ean, url) {
                    (window.__salvos = window.__salvos || []).push({ ean, url });
                    return { url: "https://banco.example/" + ean };
                }
            `
        });
    });

    await pagina.goto(BASE + "/painel", { waitUntil: "domcontentloaded" });
    await pagina.fill("#senha", "senha-qualquer");
    await pagina.click("#btnEntrar");
    await pagina.waitForSelector("#conteudo:not([style*='display: none'])", { timeout: 20000 });
    await pagina.click('[data-aba="catalogo"]');
    await pagina.waitForSelector("#semImagem table, #semImagem .vazio", { timeout: 10000 });

    return { pagina, contexto, buscados, salvos };
}

const linhasDaTabela = (pagina) =>
    pagina.$$eval("#semImagem tbody tr", (trs) => trs.map((tr) => tr.textContent.replace(/\s+/g, " ")));

/* ---- 1. o catálogo é o DESTA farmácia ------------------------------- */
console.log("\n1. a lista é da loja em que o painel está operando");
{
    const { pagina, contexto, buscados } = await abrirPainel();

    conferir("busca o catálogo da própria loja",
        buscados.some((u) => u.includes("produtos-prudente-01.json")),
        buscados.filter((u) => u.includes("produtos")).join(" | "));

    /* A asserção que descreve o defeito: antes, o painel de QUALQUER
       filial baixava o produtos.json da primeira loja. */
    conferir("e não o da primeira loja",
        !buscados.some((u) => u.endsWith("/produtos.json")),
        buscados.filter((u) => u.includes("produtos")).join(" | "));

    const linhas = await linhasDaTabela(pagina);
    conferir("nenhum produto de outra filial na tela",
        !linhas.some((l) => /SAO BERNARDO/.test(l)), linhas.join(" | "));

    await contexto.close();
}

/* ---- 2. sem filtro, a lista é a de sempre --------------------------- */
console.log("\n2. 'Todos' continua mostrando todos");
{
    const { pagina, contexto } = await abrirPainel();

    const linhas = await linhasDaTabela(pagina);

    conferir("os quatro sem imagem aparecem", linhas.length === 4, String(linhas.length));

    /* O que JÁ tem foto não entra — nem com filtro nenhum. */
    conferir("quem já tem foto fica de fora",
        !linhas.some((l) => /PROTETOR SOLAR/.test(l)), linhas.join(" | "));

    const contagem = await pagina.textContent("#contagemSemImagem");
    conferir("o total ao lado do título é o total, não o filtrado",
        /\(4\)/.test(contagem), contagem);

    await contexto.close();
}

/* ---- 3. só os MIPs --------------------------------------------------- */
console.log("\n3. o filtro que a farmácia pediu");
{
    const { pagina, contexto } = await abrirPainel();

    await pagina.selectOption("#filtroTarjaFoto", "mip");
    await pagina.waitForTimeout(400);

    const linhas = await linhasDaTabela(pagina);

    conferir("só os dois de venda livre", linhas.length === 2, linhas.join(" | "));
    conferir("a dipirona, com a tarja vinda do catálogo",
        linhas.some((l) => /DIPIRONA/.test(l)), linhas.join(" | "));

    /* A asserção do caso de Prudente: a Neosaldina NÃO tem campo tarja
       no catálogo. Se o painel lesse só o produtos.json, ela cairia em
       "sem tarja conhecida" e nunca apareceria nesta lista. */
    conferir("e a neosaldina, com a tarja vinda do tarjas.json",
        linhas.some((l) => /NEOSALDINA/.test(l)), linhas.join(" | "));

    conferir("a losartana (tarja vermelha) não entra",
        !linhas.some((l) => /LOSARTANA/.test(l)), linhas.join(" | "));
    conferir("nem o creme dental",
        !linhas.some((l) => /SENSODYNE/.test(l)), linhas.join(" | "));

    /* O total do título não pode mudar com o filtro: ele é a fila
       inteira, e é por ele que se sabe o tamanho do trabalho. */
    const contagem = await pagina.textContent("#contagemSemImagem");
    conferir("o total ao lado do título segue sendo o de todos",
        /\(4\)/.test(contagem), contagem);

    await contexto.close();
}

/* ---- 4. os tarjados, e por que ficam sem foto ----------------------- */
console.log("\n4. tarjado sem foto não é tarefa pendente");
{
    const { pagina, contexto } = await abrirPainel();

    await pagina.selectOption("#filtroTarjaFoto", "tarjado");
    await pagina.waitForTimeout(400);

    const linhas = await linhasDaTabela(pagina);
    conferir("só a losartana", linhas.length === 1 && /LOSARTANA/.test(linhas[0]), linhas.join(" | "));

    /* Sem esta frase a tela mente por omissão: quem vê "tarjados sem
       imagem" entende que faltam fotos, e vai atrás delas. */
    const explica = await pagina.textContent("#explicaFiltroFoto");
    conferir("a tela explica que a caixa neutra ali é de propósito",
        /neutra/i.test(explica) && /96\/2008/.test(explica), explica);

    await pagina.selectOption("#filtroTarjaFoto", "naomed");
    await pagina.waitForTimeout(400);

    const higiene = await linhasDaTabela(pagina);
    conferir("e 'sem tarja conhecida' traz a higiene",
        higiene.length === 1 && /SENSODYNE/.test(higiene[0]), higiene.join(" | "));

    await contexto.close();
}

/* ---- 5. o 'Aplicar' da distribuidora respeita a mesma regra --------- */
console.log("\n5. a leva da distribuidora não põe foto em tarjado");
{
    const { pagina, contexto } = await abrirPainel();

    await pagina.click("#procurarDpc");
    await pagina.waitForSelector("#aplicarDpc:not([hidden])", { timeout: 10000 });

    const status = await pagina.textContent("#statusDpc");

    /* A listagem tem foto de três produtos sem imagem — Neosaldina,
       Losartana e Sensodyne. A Losartana é tarja vermelha e não pode
       entrar na leva, por mais que a foto exista. */
    const botao = await pagina.textContent("#aplicarDpc");
    conferir("a fila é de dois, não de três", /Aplicar 2\b/.test(botao), botao);

    conferir("e o status diz quantos tarjados ficaram de fora",
        /1 tarjado/.test(status), status);

    await pagina.click("#aplicarDpc");
    await pagina.waitForTimeout(1500);

    const salvos = await pagina.evaluate(() => window.__salvos || []);
    const eans = salvos.map((s) => s.ean);

    conferir("gravou a neosaldina e o creme dental",
        eans.includes("7891000000002") && eans.includes("7891000000004"), eans.join(","));

    /* A asserção que importa: a foto da losartana existe na listagem e
       mesmo assim não foi gravada. */
    conferir("e não gravou a losartana",
        !eans.includes("7891000000003"), eans.join(","));

    await contexto.close();
}

/* ---- 6. o painel sobe antes do padronizador ------------------------- */
console.log("\n6. bundle velho não vira erro de javascript na cara da loja");
{
    const { pagina, contexto } = await abrirPainel({ comBundle: false });

    await pagina.click("#procurarDpc");
    await pagina.waitForTimeout(1200);

    const aviso = await pagina.textContent("#avisoDpc");

    /* O painel sobe pelo deploy automático do site; o bundle vem do
       domínio do padronizador, reimplantado à mão. Nas horas entre os
       dois, a loja precisa ler o que falta — e que o campo de link
       continua servindo. */
    conferir("a tela diz que falta publicar o padronizador",
        /padronizador/i.test(aviso), aviso.replace(/\s+/g, " ").slice(0, 160));

    const linhas = await linhasDaTabela(pagina);
    conferir("e a lista de fotos continua de pé", linhas.length === 4, String(linhas.length));

    await contexto.close();
}

await navegador.close();

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

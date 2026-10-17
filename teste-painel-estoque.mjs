/* A aba Estoque do painel.

   O que está sendo provado, e por que cada coisa importa:

     1. farmácia que nunca mandou estoque vê uma explicação, e não uma
        tela vazia nem três tabelas zeradas — "0 rompidos" lido como
        "está tudo bem" é pior que não mostrar nada;
     2. a lista de encalhe vem ordenada por DINHEIRO. Ordenar por
        quantidade enterra o caro embaixo do barato, que é o contrário
        do que a tela serve para decidir;
     3. a ruptura mostra quanto se deixa de faturar por dia, que é o
        número que faz alguém comprar — e não só "está zerado";
     4. a tela diz que o giro é ESTIMADO. Quem vai decidir uma compra
        precisa saber a margem de erro que está aceitando;
     5. a aba não busca nada antes de ser aberta. Três varreduras do
        estoque inteiro a cada atualização da fila seria caro à toa.

   Uso:
     npx wrangler pages dev public --port 8821
     BASE=http://127.0.0.1:8821 CHROME_PATH=... node teste-painel-estoque.mjs
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

const ANALISE = {
    loja: "mais-barato",
    origem: "diferença entre fotografias diárias de estoque",
    exato: false,
    periodo: { giro: 30, parado: 60, alerta_dias: 7 },
    atualizado_em: Date.now(),
    parado_total: { itens: 412, dinheiro: 38450.9 },
    zerados: 1270,
    rompidos: [
        { ean: "7891106000888", descricao: "Dipirona 500mg", media_dia: 6.2, venda_perdida_dia: 61.38 },
        { ean: "7898040328603", descricao: "Bactrim F", media_dia: 0.4, venda_perdida_dia: 15.96 }
    ],
    vaoRomper: [
        { ean: "7896269900303", descricao: "Betnovate creme", estoque: 2, media_dia: 1.27, dias_cobertura: 1.6 }
    ],
    parados: [
        { ean: "7896004810140", descricao: "Bismu-Jet 20ml", estoque: 8, validade: "2026-12-31", dinheiro_parado: 1520 },
        { ean: "7891010101010", descricao: "Esparadrapo", estoque: 200, validade: null, dinheiro_parado: 400 }
    ]
};

const navegador = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);

async function abrirPainel({ analise }) {
    const contexto = await navegador.newContext();
    const pagina = await contexto.newPage();
    const chamadas = [];

    await pagina.route("**/farmatech-pedidos-proxy*/**", async (rota) => {
        const url = new URL(rota.request().url());
        chamadas.push(url.pathname);

        const responder = (dados, status = 200) => rota.fulfill({
            status, contentType: "application/json",
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(dados)
        });

        if (url.pathname === "/sessao") {
            return responder({ dono: false, loja: { slug: "mais-barato", nome: "Drogaria Mais Barato", temSenhaPropria: true } });
        }
        if (url.pathname === "/estoque/analise") return responder(analise);
        if (url.pathname === "/fila") return responder({ pedidos: [], abertos: ["novo"] });
        if (url.pathname === "/banners/todos") return responder({ banners: [], podeEnviarArquivo: false });
        if (url.pathname === "/promocoes/todas") return responder({ promocoes: [], lotes: [] });
        if (url.pathname === "/encartes") return responder({ encartes: [], podeEnviarArquivo: false });
        if (url.pathname.startsWith("/catalogo")) return responder({ pendente: false });
        return responder({ erro: "Rota não encontrada." }, 404);
    });

    await pagina.goto(BASE + "/painel", { waitUntil: "domcontentloaded" });
    await pagina.fill("#senha", "senha-qualquer");
    await pagina.click("#btnEntrar");
    await pagina.waitForSelector("#conteudo:not([style*='display: none'])", { timeout: 20000 });
    await pagina.waitForTimeout(600);

    return { pagina, contexto, chamadas };
}

/* ---- 1. a aba não custa nada antes de ser aberta -------------------- */
console.log("\n1. a aba só busca quando alguém abre");
{
    const { pagina, contexto, chamadas } = await abrirPainel({ analise: ANALISE });

    conferir("entrar no painel não varre o estoque",
        !chamadas.includes("/estoque/analise"), chamadas.join(","));

    await pagina.click('[data-aba="estoque"]');
    await pagina.waitForTimeout(800);

    conferir("abrir a aba busca", chamadas.includes("/estoque/analise"), chamadas.join(","));
    await contexto.close();
}

/* ---- 2. a tela com dados -------------------------------------------- */
console.log("\n2. o que a farmácia vê");
{
    const { pagina, contexto } = await abrirPainel({ analise: ANALISE });
    await pagina.click('[data-aba="estoque"]');
    await pagina.waitForSelector("#estoqueRompidos table", { timeout: 10000 });

    const numeros = await pagina.textContent("#estoqueNumeros");
    conferir("o dinheiro parado aparece em reais, não em unidades",
        /38\.450,90/.test(numeros), numeros.replace(/\s+/g, " ").slice(0, 120));

    const rompidos = await pagina.textContent("#estoqueRompidos");
    conferir("a ruptura diz quanto se deixa de faturar por dia",
        /61,38/.test(rompidos), rompidos.replace(/\s+/g, " ").slice(0, 120));
    conferir("e identifica o produto pelo EAN também",
        /7891106000888/.test(rompidos));

    const vao = await pagina.textContent("#estoqueVaoRomper");
    conferir("'vai romper' mostra em quantos dias acaba",
        /1\.6 dia/.test(vao), vao.replace(/\s+/g, " ").slice(0, 120));

    /* A asserção que mais importa da tela: a ordem. */
    const linhasParados = await pagina.$$eval("#estoqueParados tbody tr",
        (trs) => trs.map((tr) => tr.textContent.replace(/\s+/g, " ")));
    conferir("o encalhe caro vem primeiro, mesmo tendo MENOS unidades",
        /Bismu-Jet/.test(linhasParados[0]) && /Esparadrapo/.test(linhasParados[1]),
        linhasParados.join(" | "));

    conferir("validade ausente fica em branco, e não vira 'não vence'",
        !/null|undefined|Invalid/.test(linhasParados[1]), linhasParados[1]);

    const origem = await pagina.textContent("#estoqueOrigem");
    conferir("a tela avisa que o giro é estimado",
        /estimad/i.test(origem) && /perda/i.test(origem),
        origem.replace(/\s+/g, " ").slice(0, 160));

    await contexto.close();
}

/* ---- 3. farmácia que ainda não mandou estoque ----------------------- */
console.log("\n3. quem ainda não mandou nada");
{
    const vazia = { ...ANALISE, atualizado_em: null, rompidos: [], vaoRomper: [],
                    parados: [], zerados: 0, parado_total: { itens: 0, dinheiro: 0 } };
    const { pagina, contexto } = await abrirPainel({ analise: vazia });
    await pagina.click('[data-aba="estoque"]');
    await pagina.waitForTimeout(800);

    const explica = await pagina.isVisible("#estoqueSemDados");
    conferir("explica o que falta, em vez de mostrar tabela vazia", explica);

    const tabelas = await pagina.isVisible("#estoqueConteudo");
    conferir("e não mostra '0 rompidos', que se leria como 'está tudo bem'", !tabelas);

    const texto = await pagina.textContent("#estoqueSemDados");
    conferir("dizendo de onde o dado viria",
        /PC da farmácia/.test(texto), texto.replace(/\s+/g, " ").slice(0, 140));

    await contexto.close();
}

await navegador.close();
console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

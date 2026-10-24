/* O funil, nas duas telas onde ele existe.

   NO SITE, o que este teste protege é a única coisa que faz o funil
   valer algo: CADA ETAPA CONTA UMA VEZ POR ABA. Sem isso os quatro
   números não se comparam — uma pessoa abre cinco páginas e busca três
   vezes, e "300 visitas / 90 buscas" não diria que 30% buscaram. E
   protege o que não pode sair do navegador: o corpo mandado ao worker
   tem uma palavra e nada mais, sem cookie e sem identificador.

   NO PAINEL, protege a leitura. Um funil que desenha as quatro barras
   do mesmo tamanho (cada uma medida pela anterior) é bonito e não diz
   nada; a largura tem de sair da mesma régua. E a etapa vazia não pode
   desaparecer: um funil com buraco ainda mostra onde a conta cai.

   Uso:
     npx wrangler pages dev public --port 8821
     BASE=http://127.0.0.1:8821 CHROME_PATH=... node teste-funil-na-tela.mjs
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

/* =====================================================================
   PARTE 1 — o site marca as etapas
   ===================================================================== */

/* Guarda tudo que foi mandado para /funil. sendBeacon não passa pelo
   route() do Playwright de forma confiável, então ele é trocado por uma
   função que registra e devolve false — e aí o próprio script.js cai no
   fetch, que o route() intercepta. O caminho testado é o de verdade. */
const CATALOGO = {
    produtos: [
        { codigo: "1", ean: "7891106002001", descricao: "Dipirona Sódica 500mg Com/10",
          marca: "EMS", precoVenda: "9.90", categoria: "GENERICO", estoque: 30 },
        { codigo: "2", ean: "7891106002002", descricao: "Paracetamol 750mg Com/20",
          marca: "EMS", precoVenda: "12.50", categoria: "GENERICO", estoque: 20 }
    ]
};

async function abrirSite() {

    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
    const pagina = await contexto.newPage();

    const marcadas = [];

    await pagina.addInitScript(() => {
        navigator.sendBeacon = () => false;
    });

    /* O catch-all vem PRIMEIRO de propósito: o Playwright casa as rotas
       na ordem inversa do cadastro, então a rota específica do /funil
       tem de ser a última a entrar para ganhar da genérica. */
    await pagina.route("**/farmatech-pedidos-proxy*/**", (rota) => rota.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ ok: true, produtos: [], promocoes: [], banners: [] })
    }));

    await pagina.route("**/funil", async (rota) => {
        const cru = rota.request().postData() || "";
        let corpo = null;
        try { corpo = JSON.parse(cru || "null"); } catch { /* lixo */ }
        marcadas.push({ corpo, cru });
        await rota.fulfill({
            status: 200, contentType: "application/json",
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ ok: true })
        });
    });

    await pagina.route(/produtos.*\.json|raw\.githubusercontent/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(CATALOGO)
    }));

    await pagina.goto(BASE + "/loja/mais-barato", { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(2500);

    return { pagina, contexto, marcadas };
}

const etapas = (marcadas) => marcadas.map(m => m.corpo && m.corpo.etapa);

console.log("\n1. a visita conta uma vez por aba");
{
    const { pagina, contexto, marcadas } = await abrirSite();

    await pagina.waitForTimeout(600);

    conferir("entrar no site marca 'visita'",
        etapas(marcadas).includes("visita"), JSON.stringify(etapas(marcadas)));

    /* O corpo é a prova de que nada identificável sai do navegador. O
       número da aba mora no sessionStorage e é o próprio site que usa —
       se ele aparecer aqui, há dado pessoal onde não devia haver, e com
       ele volta a exigência de banner de consentimento. */
    const cru = (marcadas.find(m => m.corpo && m.corpo.etapa === "visita") || {}).cru || "";
    conferir("e o corpo tem só a etapa", cru === '{"etapa":"visita"}', cru);

    const chaves = Object.keys(JSON.parse(cru || "{}"));
    conferir("nenhum identificador no corpo",
        chaves.length === 1 && chaves[0] === "etapa", JSON.stringify(chaves));

    /* Navegar dentro do site NÃO é visita nova. É o erro que tornaria o
       funil ilegível: quem olha cinco produtos viraria cinco visitas, e
       a taxa de pedido cairia por cinco sem nada ter mudado na loja. */
    const antes = etapas(marcadas).filter(e => e === "visita").length;

    await pagina.goto(BASE + "/loja/mais-barato?busca=dipirona", { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(900);
    await pagina.goto(BASE + "/loja/mais-barato", { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(900);

    const depois = etapas(marcadas).filter(e => e === "visita").length;

    conferir(`três páginas, uma visita — ${depois}`, depois === antes && antes === 1,
        `antes ${antes}, depois ${depois}`);

    await contexto.close();
}

console.log("\n2. buscar e pôr no carrinho, uma vez cada");
{
    const { pagina, contexto, marcadas } = await abrirSite();

    await pagina.fill("#busca", "dipirona");
    await pagina.waitForTimeout(700);

    conferir("digitar na busca marca 'busca'",
        etapas(marcadas).includes("busca"), JSON.stringify(etapas(marcadas)));

    /* Digitar é um evento por tecla. Se cada tecla marcasse, "busca"
       passaria de "visita" e o funil subiria no meio. */
    await pagina.fill("#busca", "paracetamol");
    await pagina.waitForTimeout(700);
    await pagina.fill("#busca", "dipirona de novo");
    await pagina.waitForTimeout(700);

    const buscas = etapas(marcadas).filter(e => e === "busca").length;
    conferir(`três buscas, uma marcação — ${buscas}`, buscas === 1, String(buscas));

    /* O carrinho só conta quando o item ENTRA. A grade só existe depois
       de uma busca — na home o que está montado é o carrossel. */
    await pagina.fill("#busca", "dipirona");
    await pagina.waitForTimeout(800);
    await pagina.click('#produtos .card[data-codigo="1"] [data-acao="mais"]');
    await pagina.waitForTimeout(600);

    const carrinhos = etapas(marcadas).filter(e => e === "carrinho").length;
    conferir(`pôr no carrinho marca 'carrinho' — ${carrinhos}`, carrinhos === 1,
        JSON.stringify(etapas(marcadas)));

    /* Dois itens, dois cliques, uma etapa: o funil conta visitas que
       chegaram ao carrinho, não itens no carrinho. */
    await pagina.fill("#busca", "paracetamol");
    await pagina.waitForTimeout(800);
    await pagina.click('#produtos .card[data-codigo="2"] [data-acao="mais"]');
    await pagina.waitForTimeout(600);

    const depois = etapas(marcadas).filter(e => e === "carrinho").length;
    conferir(`segundo item, ainda uma marcação — ${depois}`, depois === 1, String(depois));

    /* E o site nunca manda "pedido": essa etapa é do worker, no pedido
       de verdade. Mandada daqui, o painel mostraria venda que não
       existe. */
    conferir("o site nunca manda 'pedido'",
        !etapas(marcadas).includes("pedido"), JSON.stringify(etapas(marcadas)));

    await contexto.close();
}

console.log("\n3. sem sessionStorage, o site não quebra");
{
    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
    const pagina = await contexto.newPage();

    const erros = [];
    pagina.on("pageerror", (e) => erros.push(String(e)));

    /* Aba privada com armazenamento bloqueado: o acessor JOGA. É o
       cenário em que uma contagem mal escrita derruba o site inteiro
       antes do primeiro produto aparecer na tela. */
    await pagina.addInitScript(() => {
        Object.defineProperty(window, "sessionStorage", {
            get() { throw new Error("bloqueado"); }
        });
    });

    await pagina.route("**/farmatech-pedidos-proxy*/**", (rota) => rota.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ ok: true, produtos: [], promocoes: [], banners: [] })
    }));

    await pagina.route(/produtos.*\.json|raw\.githubusercontent/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(CATALOGO)
    }));

    await pagina.goto(BASE + "/loja/mais-barato", { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(2500);

    const semErroDoFunil = !erros.some(e => /funil|marcarEtapa|sessionStorage/i.test(e));
    conferir("nenhum erro vindo do funil", semErroDoFunil, JSON.stringify(erros));

    const temProduto = await pagina.locator(".btn-add").count();
    conferir("e a loja abre normalmente", temProduto > 0, String(temProduto));

    await contexto.close();
}

/* =====================================================================
   PARTE 2 — o painel desenha o funil
   ===================================================================== */

function resumoComFunil(funil) {
    return {
        dias: 30,
        hoje: { pedidos: 0, faturamento: 0 },
        periodo: { pedidos: 12, faturamento: 1010.28, ticket: 84.19 },
        anterior: { pedidos: 10, faturamento: 850, ticket: 85 },
        porDia: [],
        topProdutos: [],
        recentes: [],
        aguardandoReceita: 0,
        maisProcurados: [],
        naoEncontrados: [],
        funil
    };
}

async function abrirRelatorios(resumo) {

    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
    const pagina = await contexto.newPage();

    await pagina.route("**/farmatech-pedidos-proxy*/**", async (rota) => {
        const url = new URL(rota.request().url());
        const responder = (dados, status = 200) => rota.fulfill({
            status, contentType: "application/json",
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(dados)
        });

        if (url.pathname === "/sessao") {
            return responder({ dono: false, loja: { slug: "mais-barato", nome: "Drogaria Mais Barato", temSenhaPropria: true } });
        }
        if (url.pathname === "/resumo") return responder(resumo);
        if (url.pathname === "/clientes") return responder({ clientes: [] });
        if (url.pathname === "/fila") return responder({ pedidos: [], abertos: ["novo"] });
        if (url.pathname === "/banners/todos") return responder({ banners: [], podeEnviarArquivo: false });
        if (url.pathname === "/promocoes/todas") return responder({ promocoes: [], lotes: [] });
        if (url.pathname === "/encartes") return responder({ encartes: [], podeEnviarArquivo: false });
        if (url.pathname === "/cupons") return responder({ cupons: [] });
        if (url.pathname.startsWith("/catalogo")) return responder({ pendente: false });
        return responder({ erro: "Rota não encontrada." }, 404);
    });

    await pagina.goto(BASE + "/painel", { waitUntil: "domcontentloaded" });
    await pagina.fill("#senha", "senha-qualquer");
    await pagina.click("#btnEntrar");
    await pagina.waitForSelector("#conteudo:not([style*='display: none'])", { timeout: 20000 });

    await pagina.click('[data-aba="relatorios"]');
    await pagina.waitForSelector("#funil .funil-etapa, #funil .vazio", { timeout: 10000 });

    return { pagina, contexto };
}

console.log("\n4. o funil do painel");
{
    /* O caso da farmácia: 400 entram, 160 buscam, 48 põem no carrinho,
       12 pedem. A perda grande está entre busca e carrinho. */
    const { pagina, contexto } = await abrirRelatorios(resumoComFunil({
        visita: 400, busca: 160, carrinho: 48, pedido: 12
    }));

    const barras = await pagina.locator("#funil .funil-etapa").count();
    conferir(`quatro etapas na tela — ${barras}`, barras === 4, String(barras));

    const larguras = await pagina.locator("#funil .funil-barra")
        .evaluateAll((es) => es.map(e => e.style.width));

    /* A régua é a mesma para as quatro: 400 / 160 / 48 / 12 sobre 400.
       Se cada barra fosse medida pela anterior, todas sairiam largas e
       o desenho não diria nada. */
    conferir("as larguras saem da mesma régua",
        JSON.stringify(larguras) === JSON.stringify(["100%", "40%", "12%", "3%"]),
        JSON.stringify(larguras));

    const texto = (await pagina.textContent("#funil") || "").replace(/\s+/g, " ");

    conferir("o número de cada etapa aparece",
        /400/.test(texto) && /160/.test(texto) && /48/.test(texto) && /12/.test(texto), texto);

    /* O percentual relativo à etapa anterior é a frase que o dono leva
       para a reunião: 30% de quem buscou chegou ao carrinho. */
    conferir("e o percentual de quem veio da etapa anterior",
        /40% de quem entrou/.test(texto) && /30% de quem buscou/.test(texto), texto);

    /* A queda escrita, que é o ponto do gráfico: onde a conta cai. A
       maior é entre busca e carrinho — 112 visitas. */
    const quedas = await pagina.locator("#funil .funil-queda").allTextContents();
    const limpas = quedas.map(q => q.replace(/\s+/g, " ").trim());

    conferir(`uma queda entre cada par de etapas — ${limpas.length}`,
        limpas.length === 3, JSON.stringify(limpas));
    conferir("a maior perda é entre buscar e o carrinho",
        /70%/.test(limpas[1]) && /112/.test(limpas[1]), JSON.stringify(limpas));

    const rodape = (await pagina.textContent("#funilRodape") || "").replace(/\s+/g, " ");

    /* 12 de 400 = 3%. É a taxa que a loja compara com o mês passado. */
    conferir("o rodapé dá a taxa do funil inteiro", /de cada 100 visitas, 3 pedem/.test(rodape), rodape);
    conferir("e quantas saíram sem pedir", /388/.test(rodape), rodape);

    await contexto.close();
}

console.log("\n5. etapa vazia continua na tela");
{
    /* Loja nova: gente entrando, ninguém pedindo. É justamente aqui que
       o funil serve para algo — e esconder a linha zerada faria o
       buraco parecer que nunca existiu. */
    const { pagina, contexto } = await abrirRelatorios(resumoComFunil({
        visita: 50, busca: 20, carrinho: 0, pedido: 0
    }));

    const barras = await pagina.locator("#funil .funil-etapa").count();
    conferir("as quatro etapas seguem desenhadas", barras === 4, String(barras));

    /* Barra zerada não pode ter largura mínima: 3px de barra azul num
       zero lê-se como "uns poucos", e não é. */
    const zeradas = await pagina.locator("#funil .funil-barra-zero").count();
    conferir(`as duas etapas vazias aparecem como zero — ${zeradas}`, zeradas === 2,
        String(zeradas));

    const quedas = await pagina.locator("#funil .funil-queda").allTextContents();
    const limpas = quedas.map(q => q.replace(/\s+/g, " ").trim());

    /* A queda de 20 para 0 é 100% e é informação. A de 0 para 0 não é
       conta nenhuma — e "perdeu 100%" ali diria algo que o número não
       sustenta. */
    conferir("a queda para zero é escrita",
        limpas.some(q => /100%/.test(q)), JSON.stringify(limpas));
    conferir("e não há queda entre duas etapas zeradas", limpas.length === 2,
        JSON.stringify(limpas));

    await contexto.close();
}

console.log("\n6. a loja que ainda não colou o schema");
{
    /* Zerado tem duas causas, e a tela precisa dizer qual. "Nenhuma
       visita" numa loja que teve movimento é mentira tranquilizadora —
       a pior espécie: o dono acha que o site não tem público e para de
       divulgar. */
    const { pagina, contexto } = await abrirRelatorios(resumoComFunil({}));

    const texto = (await pagina.textContent("#funil") || "").replace(/\s+/g, " ");

    conferir("a tela explica o que pode estar faltando",
        /schema-funil\.sql/.test(texto), texto);

    const barras = await pagina.locator("#funil .funil-etapa").count();
    conferir("e não desenha quatro barras de zero", barras === 0, String(barras));

    /* O resto da aba Relatórios é o que a loja usa todo dia: não pode
       sumir por causa de um gráfico novo que veio vazio. */
    const numeros = (await pagina.textContent("#numeros") || "");
    conferir("o resto do relatório continua de pé", /1\.010,28/.test(numeros), numeros);

    await contexto.close();
}

await navegador.close();

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

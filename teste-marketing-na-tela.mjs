/* Marketing: o carimbo no site e a aba no painel.

   NO SITE, o que este teste protege é o que torna a medição honesta:

     - o carimbo some da barra depois de lido. Sem isso, o cliente que
       recebe o anúncio e manda o link para a tia faz a tia entrar como
       clique comprado — e a loja passa a achar que pagou por visitas
       que o anúncio não trouxe;
     - ele sobrevive à navegação e ao fechar da aba, porque quem vê o
       anúncio no almoço compra à noite;
     - e ele morre depois de 7 dias, senão a campanha de outubro leva
       crédito pela venda de dezembro.

   NO PAINEL, protege a leitura: as duas contas que decidem se a
   campanha continua (custo por pedido e retorno) e o fato de a aba
   nunca sugerir o que exige receita.

   Uso:
     npx wrangler pages dev public --port 8821
     BASE=http://127.0.0.1:8821 CHROME_PATH=... node teste-marketing-na-tela.mjs
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

const CATALOGO = {
    produtos: [
        /* Preços como NÚMERO e categorias como o Farmax escreve: é o
           formato do produtos.json de verdade. Com string "59.90" o
           numeroBR do painel lê 5990, e o teste passaria mostrando
           R$ 4.990,00 numa fralda. */
        { codigo: "1", ean: "7891106002001", descricao: "Dipirona Sódica 500mg Com/10",
          marca: "EMS", precoVenda: 9.9, categoria: "GENERICO", estoque: 30 },
        { codigo: "2", ean: "7891106002002", descricao: "Fralda Pompom M C/40",
          marca: "Pompom", precoVenda: 59.9, precoPromocao: 49.9,
          categoria: "FRALDAS", estoque: 40 },
        { codigo: "3", ean: "7891106002003", descricao: "Bactrim F C/10 Comprimidos",
          marca: "FQM", precoVenda: 39.37, categoria: "ETICO CONTROLADO",
          estoque: 50 }
    ]
};

/* =====================================================================
   PARTE 1 — o carimbo no site
   ===================================================================== */

async function abrirSite(caminho) {

    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
    const pagina = await contexto.newPage();

    const visitas = [];

    await pagina.addInitScript(() => { navigator.sendBeacon = () => false; });

    /* O catch-all primeiro: o Playwright casa as rotas na ordem inversa
       do cadastro, então a específica tem de entrar por último. */
    await pagina.route("**/farmatech-pedidos-proxy*/**", (rota) => rota.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ ok: true, produtos: [], promocoes: [], banners: [] })
    }));

    await pagina.route("**/campanha", async (rota) => {
        let corpo = null;
        try { corpo = JSON.parse(rota.request().postData() || "null"); } catch { /* lixo */ }
        visitas.push(corpo);
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

    await pagina.goto(BASE + caminho, { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(1200);

    return { pagina, contexto, visitas };
}

console.log("\n1. o carimbo é lido, contado e apagado da barra");
{
    const { pagina, contexto, visitas } = await abrirSite(
        "/loja/mais-barato?c=instagram-outubro");

    conferir("a visita da campanha é contada",
        visitas.length === 1 && visitas[0].campanha === "instagram-outubro",
        JSON.stringify(visitas));

    /* O corpo tem a campanha e nada mais: continua sem identificar
       ninguém, como o funil. */
    conferir("e o corpo tem só a campanha",
        Object.keys(visitas[0] || {}).join() === "campanha",
        JSON.stringify(visitas[0]));

    /* O defeito que isto impede: o link com carimbo circulando no
       WhatsApp e cada repasse virando clique comprado. */
    const url = new URL(pagina.url());
    conferir("o carimbo some da barra de endereço",
        !url.searchParams.has("c"), pagina.url());

    const guardado = await pagina.evaluate(() => campanhaDeOrigem());
    conferir("mas continua guardado para o pedido",
        guardado === "instagram-outubro", guardado);

    await contexto.close();
}

console.log("\n2. sobrevive à navegação, e não conta duas vezes");
{
    const { pagina, contexto, visitas } = await abrirSite(
        "/loja/mais-barato?c=google-outubro");

    await pagina.goto(BASE + "/loja/mais-barato", { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(900);

    /* Quem clica no anúncio e navega pelo site não é dois cliques
       comprados. */
    conferir("uma visita só, mesmo depois de navegar",
        visitas.length === 1, JSON.stringify(visitas));

    const guardado = await pagina.evaluate(() => campanhaDeOrigem());
    conferir("e a campanha continua valendo na página seguinte",
        guardado === "google-outubro", guardado);

    await contexto.close();
}

console.log("\n3. utm_campaign também vale");
{
    /* O Meta e o Google carimbam sozinhos com utm_campaign quando a
       opção está ligada lá. Perder essa forma seria perder justamente
       as campanhas montadas fora do painel. */
    const { pagina, contexto, visitas } = await abrirSite(
        "/loja/mais-barato?utm_source=facebook&utm_campaign=meta-fraldas");

    conferir("a campanha do utm é contada",
        visitas[0] && visitas[0].campanha === "meta-fraldas", JSON.stringify(visitas));

    const url = new URL(pagina.url());
    conferir("e os utm somem da barra junto",
        !url.searchParams.has("utm_campaign") && !url.searchParams.has("utm_source"),
        pagina.url());

    await contexto.close();
}

console.log("\n4. depois de 7 dias, a campanha não leva mais crédito");
{
    const { pagina, contexto } = await abrirSite("/loja/mais-barato?c=setembro-antigo");

    /* Oito dias atrás. Sem o prazo, a campanha de outubro levaria
       crédito pela venda de dezembro, e o custo por pedido dela
       pareceria cair sozinho com o tempo. */
    await pagina.evaluate(() => {
        localStorage.setItem("campanha-de-origem", JSON.stringify({
            id: "setembro-antigo", quando: Date.now() - 8 * 86400000
        }));
    });

    const vencida = await pagina.evaluate(() => campanhaDeOrigem());
    conferir("campanha de 8 dias atrás não conta mais", vencida === "", vencida);

    /* Dentro do prazo continua valendo: quem vê o anúncio na segunda e
       compra na sexta é venda da campanha. */
    await pagina.evaluate(() => {
        localStorage.setItem("campanha-de-origem", JSON.stringify({
            id: "setembro-antigo", quando: Date.now() - 5 * 86400000
        }));
    });

    const dentro = await pagina.evaluate(() => campanhaDeOrigem());
    conferir("a de 5 dias ainda vale", dentro === "setembro-antigo", dentro);

    await contexto.close();
}

console.log("\n5. sem carimbo nenhum, nada acontece");
{
    const { pagina, contexto, visitas } = await abrirSite("/loja/mais-barato");

    /* A maioria das visitas é assim, e é a comparação com elas que diz
       se o anúncio valeu. */
    conferir("visita normal não vira visita de campanha",
        visitas.length === 0, JSON.stringify(visitas));

    const vazio = await pagina.evaluate(() => campanhaDeOrigem());
    conferir("e o pedido sai sem campanha", vazio === "", vazio);

    await contexto.close();
}

/* =====================================================================
   PARTE 2 — a aba Marketing do painel
   ===================================================================== */

const CAMPANHAS = {
    dias: 30,
    campanhas: [
        { id: "instagram-outubro", nome: "Instagram outubro — fraldas",
          canal: "instagram", gasto: 80, ativa: 1, criado_em: Date.now(),
          visitas: 120, pedidos: 4, receita: 560 },
        { id: "google-setembro", nome: "Google setembro", canal: "google",
          gasto: 200, ativa: 0, criado_em: Date.now() - 86400000,
          visitas: 90, pedidos: 1, receita: 70 }
    ]
};

const RESUMO = {
    dias: 30,
    hoje: { pedidos: 0, faturamento: 0 },
    periodo: { pedidos: 12, faturamento: 1010.28, ticket: 84.19 },
    anterior: { pedidos: 10, faturamento: 850, ticket: 85 },
    porDia: [], topProdutos: [], recentes: [], aguardandoReceita: 0,
    maisProcurados: [
        { termo: "fralda pompom", buscas: 22, vazias: 0 },
        { termo: "bactrim", buscas: 40, vazias: 0 },
        { termo: "dipirona", buscas: 12, vazias: 0 }
    ],
    naoEncontrados: [{ termo: "ozempic", buscas: 14, ultima: Date.now() }],
    funil: { visita: 400, busca: 160, carrinho: 48, pedido: 12 }
};

async function abrirMarketing() {

    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 1000 } });
    const pagina = await contexto.newPage();

    await pagina.route(/raw\.githubusercontent/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(CATALOGO)
    }));

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
        if (url.pathname === "/campanhas") return responder(CAMPANHAS);
        if (url.pathname === "/resumo") return responder(RESUMO);
        /* Farmácia sem o extrator instalado: a aba tem de funcionar
           assim mesmo, só sem o veto do que está acabando. */
        if (url.pathname === "/estoque/analise") return responder({ erro: "sem dados" }, 404);
        if (url.pathname === "/fila") return responder({ pedidos: [], abertos: ["novo"] });
        return responder({ ok: true, cupons: [], clientes: [], banners: [],
                           promocoes: [], lotes: [], encartes: [], pendente: false });
    });

    await pagina.goto(BASE + "/painel", { waitUntil: "domcontentloaded" });
    await pagina.fill("#senha", "senha-qualquer");
    await pagina.click("#btnEntrar");
    await pagina.waitForSelector("#conteudo:not([style*='display: none'])", { timeout: 20000 });

    await pagina.click('[data-aba="marketing"]');
    await pagina.waitForSelector("#listaCampanhas table, #listaCampanhas .vazio", { timeout: 15000 });
    await pagina.waitForTimeout(1500);

    return { pagina, contexto };
}

console.log("\n6. as contas que decidem se a campanha continua");
{
    const { pagina, contexto } = await abrirMarketing();

    const tabela = (await pagina.textContent("#listaCampanhas") || "").replace(/\s+/g, " ");

    /* R$ 80 e 4 pedidos = R$ 20 por pedido. É a conta que o dono faz
       errado de cabeça, e a que decide o mês seguinte. */
    conferir("custo por pedido aparece pronto", /20,00/.test(tabela), tabela);

    /* 560 / 80 = 7×. A de setembro deu 0,35× — gastou 200 e vendeu 70. */
    conferir("e o retorno também", /7\.0×/.test(tabela) || /7,0×/.test(tabela), tabela);
    conferir("a campanha ruim aparece como ruim",
        /0\.4×|0,4×|0\.3×|0,3×/.test(tabela), tabela);

    conferir("a desligada continua na lista, marcada",
        /desligada/.test(tabela), tabela);

    await contexto.close();
}

console.log("\n7. o que anunciar, na tela");
{
    const { pagina, contexto } = await abrirMarketing();

    const cartoes = await pagina.locator(".sugestao").count();
    conferir(`a aba sugere alguma coisa — ${cartoes}`, cartoes > 0, String(cartoes));

    const texto = (await pagina.textContent("#anunciarLista") || "").replace(/\s+/g, " ");

    conferir("a fralda procurada entra", /Fralda Pompom/.test(texto), texto);

    /* O mais buscado dos três é o controlado, com 40 buscas, e ele NÃO
       tem campo tarja no catálogo — quem o barra é a categoria. Uma
       regra que ordenasse só por demanda o poria no topo, e a conta da
       loja seria suspensa pelo Google e pelo Meta. */
    conferir("o controlado NÃO entra", !/Bactrim/.test(texto), texto);

    /* E a dipirona, que é venda livre, também não: anúncio de
       medicamento exige advertência e registro que este texto não
       carrega. */
    conferir("nem o medicamento de venda livre",
        !/Dipirona/.test(texto), texto);

    /* O preço tem de sair certo: R$ 49,90, não R$ 4.990,00. */
    conferir("o preço sai no valor de verdade",
        /49,90/.test(texto) && !/4\.990/.test(texto), texto);

    const aviso = (await pagina.textContent("#anunciarAviso") || "").replace(/\s+/g, " ");
    conferir("a tela explica por que remédio não aparece",
        /rem[ée]dio|medicamento/i.test(aviso), aviso);
    conferir("e avisa que falta a fotografia de estoque",
        /estoque/i.test(aviso), aviso);

    /* O link já sai carimbado com a campanha ativa — sem isso não há
       como saber depois se o anúncio vendeu. */
    const primeiro = await pagina.locator(".sugestao-texto").first().inputValue();
    conferir("o texto já vem com o link carimbado",
        /[?&]c=instagram-outubro/.test(primeiro), primeiro);
    conferir("e com o nome da loja", /Mais Barato/.test(primeiro), primeiro);

    /* O que procuraram e não acharam fica em outra lista: é compra, não
       anúncio. */
    const faltando = (await pagina.textContent("#anunciarFaltando") || "");
    conferir("'procuraram e não acharam' vem separado",
        /ozempic/i.test(faltando), faltando);
    conferir("e não vira sugestão de anúncio", !/ozempic/i.test(texto), texto);

    await contexto.close();
}

await navegador.close();

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

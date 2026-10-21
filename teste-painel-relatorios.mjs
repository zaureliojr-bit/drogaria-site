/* A aba Relatórios do painel.

   O defeito que este arquivo existe para impedir de voltar: o gráfico
   de "Faturamento por dia" desenhava uma barra por LINHA DA CONSULTA, e
   a consulta agrupa por dia — ou seja, só os dias que tiveram pedido.
   Com 13 pedidos em 30 dias chegavam 6 linhas, e a tela desenhava 6
   barras ocupando a largura toda. Lido assim, parecia venda todo dia.
   Os 24 dias parados, que são a informação que importa numa loja
   começando, não existiam no desenho.

   E a comparação com o período anterior, que é o que faz número virar
   informação — com o cuidado de não dividir por zero numa loja nova.

   Uso:
     npx wrangler pages dev public --port 8821
     BASE=http://127.0.0.1:8821 CHROME_PATH=... node teste-painel-relatorios.mjs
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

/* O dia em São Paulo, que é como o worker agrupa. */
const diaSP = (quantosDiasAtras) => new Date(
    Date.now() - 3 * 3600000 - quantosDiasAtras * 86400000
).toISOString().slice(0, 10);

/* O caso real da farmácia: 13 pedidos espalhados por 30 dias. */
function resumoDeTeste(extras = {}) {
    return {
        dias: 30,
        hoje: { pedidos: 0, faturamento: 0 },
        periodo: { pedidos: 13, faturamento: 1010.28, ticket: 77.71 },
        porDia: [
            { dia: diaSP(9), pedidos: 2, faturamento: 150.5 },
            { dia: diaSP(7), pedidos: 3, faturamento: 420.9 },
            { dia: diaSP(4), pedidos: 1, faturamento: 38.9 },
            { dia: diaSP(2), pedidos: 4, faturamento: 300.0 },
            { dia: diaSP(1), pedidos: 3, faturamento: 99.98 }
        ],
        topProdutos: Array.from({ length: 10 }, (_, i) => ({
            descricao: `Produto ${i + 1}`, ean: `789110600000${i}`,
            unidades: 10 - i, faturamento: 100 - i
        })),
        recentes: Array.from({ length: 15 }, (_, i) => ({
            ref: `P${100 + i}`, criado_em: Date.now() - i * 3600000,
            cliente: `Cliente ${i + 1}`, telefone: "11999990000",
            entrega: "Entrega", pagamento: "Pix", total: 50 + i,
            tem_receita: 0, status: "novo"
        })),
        aguardandoReceita: 0,
        maisProcurados: [],
        naoEncontrados: [],
        ...extras
    };
}

const navegador = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);

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
        if (url.pathname.startsWith("/catalogo")) return responder({ pendente: false });
        return responder({ erro: "Rota não encontrada." }, 404);
    });

    await pagina.goto(BASE + "/painel", { waitUntil: "domcontentloaded" });
    await pagina.fill("#senha", "senha-qualquer");
    await pagina.click("#btnEntrar");
    await pagina.waitForSelector("#conteudo:not([style*='display: none'])", { timeout: 20000 });

    await pagina.click('[data-aba="relatorios"]');
    await pagina.waitForSelector("#barras .barras-grade, #barras .vazio", { timeout: 10000 });

    return { pagina, contexto };
}

/* ---- 1. o eixo é o calendário --------------------------------------- */
console.log("\n1. o gráfico mostra os dias parados");
{
    const { pagina, contexto } = await abrirRelatorios(resumoDeTeste());

    const barras = await pagina.locator("#barras .barra").count();

    /* 30 dias de período = 30 lugares, e não 5 porque só 5 tiveram
       venda. É a asserção que o defeito antigo não passa. */
    conferir(`uma barra por dia do período — ${barras}`, barras === 30, String(barras));

    const vazias = await pagina.locator("#barras .barra-vazia").count();
    conferir(`e 25 deles aparecem como dia sem venda — ${vazias}`, vazias === 25, String(vazias));

    /* Dia zerado não pode parecer venda pequena. */
    const alturaVazia = await pagina.locator("#barras .barra-vazia").first()
        .evaluate((e) => e.style.height);
    conferir("dia sem venda tem altura zero", alturaVazia === "0%", alturaVazia);

    /* O melhor dia é o de R$ 420,90, e ele é marcado. */
    const melhor = await pagina.locator("#barras .barra-melhor").count();
    conferir("o melhor dia é destacado, e é um só", melhor === 1, String(melhor));

    const rodape = (await pagina.textContent("#barrasRodape") || "").replace(/\s+/g, " ");
    conferir("o rodapé diz quanto foi o melhor dia", /420,90/.test(rodape), rodape);
    conferir("e quantos dias não tiveram venda", /25 dias sem venda/.test(rodape), rodape);

    /* A média conta os dias parados: 1.010,28 / 30 = R$ 33,68. A conta
       que ignora os dias vazios daria 202,06 — seis vezes maior, e
       seria a resposta para outra pergunta. */
    conferir("e a média por dia conta os dias parados", /33,68/.test(rodape), rodape);

    await contexto.close();
}

/* ---- 2. a comparação com o período anterior ------------------------- */
console.log("\n2. está melhor ou pior que antes?");
{
    const { pagina, contexto } = await abrirRelatorios(resumoDeTeste({
        anterior: { pedidos: 10, faturamento: 850, ticket: 85 }
    }));

    const numeros = (await pagina.textContent("#numeros") || "").replace(/\s+/g, " ");

    /* 1010,28 contra 850 = +18,9% → sobe. */
    conferir("o faturamento mostra que subiu", /▲ 19%/.test(numeros), numeros);

    /* Ticket caiu de 85 para 77,71 = -8,6%, e isso não pode ser pintado
       como alta só porque o faturamento subiu. */
    conferir("e o ticket, que caiu, mostra queda", /▼ 9%/.test(numeros), numeros);

    const subiu = await pagina.locator("#numeros .var-sobe").count();
    const desceu = await pagina.locator("#numeros .var-desce").count();
    conferir("cada um com a sua cor", subiu === 2 && desceu === 1, `${subiu} sobe / ${desceu} desce`);

    await contexto.close();
}

/* ---- 3. loja nova, sem período anterior ----------------------------- */
console.log("\n3. a primeira semana de uma loja nova");
{
    const { pagina, contexto } = await abrirRelatorios(resumoDeTeste({
        anterior: { pedidos: 0, faturamento: 0, ticket: 0 }
    }));

    const numeros = (await pagina.textContent("#numeros") || "").replace(/\s+/g, " ");

    /* Variação percentual sobre base zero é infinita. "+∞%" ou
       "+100.000%" na primeira semana faz a tela perder a credibilidade
       justo quando ela está sendo mostrada ao cliente novo. */
    conferir("não inventa porcentagem sobre zero",
        !/%/.test(numeros) && !/Infinity|NaN|∞/.test(numeros), numeros);

    conferir("e o faturamento continua na tela", /1\.010,28/.test(numeros), numeros);

    await contexto.close();
}

/* ---- 4. o painel antes de o worker ser atualizado ------------------- */
console.log("\n4. o painel funciona sem o campo novo");
{
    /* O painel publica sozinho (Pages); o worker é implantado à mão.
       Entre uma coisa e outra há uma janela em que a tela nova fala com
       o servidor velho — e ela não pode quebrar nessa janela. */
    const { pagina, contexto } = await abrirRelatorios(resumoDeTeste());

    const numeros = (await pagina.textContent("#numeros") || "").replace(/\s+/g, " ");

    conferir("sem 'anterior', os números aparecem igual", /1\.010,28/.test(numeros), numeros);
    conferir("e sem comparação nenhuma inventada",
        !/▲|▼/.test(numeros), numeros);

    const barras = await pagina.locator("#barras .barra").count();
    conferir("e o gráfico continua inteiro", barras === 30, String(barras));

    await contexto.close();
}

/* ---- 5. período sem venda nenhuma ----------------------------------- */
console.log("\n5. nenhum pedido no período");
{
    const { pagina, contexto } = await abrirRelatorios(resumoDeTeste({
        porDia: [], periodo: { pedidos: 0, faturamento: 0, ticket: 0 }
    }));

    const vazio = await pagina.locator("#barras .vazio").count();
    conferir("diz que não houve pedido, em vez de desenhar 30 barras zeradas",
        vazio === 1, String(vazio));

    const rodape = (await pagina.textContent("#barrasRodape") || "").trim();
    conferir("e não sobra rodapé falando de melhor dia", rodape === "", rodape);

    await contexto.close();
}

/* ---- 6. as tabelas em páginas --------------------------------------- */
console.log("\n6. cinco linhas por vez, e o resto a um toque");
{
    /* Seis tabelas empilhadas despejando tudo davam 65 linhas numa tela
       só: quem abria o painel para ver o dia rolava seis vezes até o
       fim, e as tabelas de baixo nunca eram lidas. */
    const { pagina, contexto } = await abrirRelatorios(resumoDeTeste({
        anterior: { pedidos: 10, faturamento: 850, ticket: 85 }
    }));

    const linhas = (id) => pagina.locator(`#${id} tbody tr`).count();

    conferir("produtos mais vendidos mostra 5 de 10", await linhas("relProdutos") === 5,
        String(await linhas("relProdutos")));
    conferir("últimos pedidos mostra 5 de 15", await linhas("pedidos") === 5,
        String(await linhas("pedidos")));

    /* O rodapé é o que impede a página 1 de parecer a lista inteira. */
    const conta = await pagina.textContent("#relProdutos .paginacao-conta");
    conferir("e diz quanto é o resto", /1–5 de 10/.test(conta || ""), String(conta));

    /* Voltar da primeira página não existe. */
    const anteriorDesligado = await pagina.locator('#relProdutos [data-ir="-1"]').isDisabled();
    conferir("na primeira página, voltar está desligado", anteriorDesligado);

    await pagina.click('#relProdutos [data-ir="1"]');
    await pagina.waitForTimeout(200);

    const contaDepois = await pagina.textContent("#relProdutos .paginacao-conta");
    conferir("avançar leva para a segunda", /6–10 de 10/.test(contaDepois || ""), String(contaDepois));

    const primeiro = await pagina.textContent("#relProdutos tbody tr:first-child td");
    conferir("e as linhas mudaram", /Produto 6/.test(primeiro || ""), String(primeiro));

    const proximoDesligado = await pagina.locator('#relProdutos [data-ir="1"]').isDisabled();
    conferir("na última página, avançar está desligado", proximoDesligado);

    /* Paginar uma tabela não pode mexer na outra. */
    const contaPedidos = await pagina.textContent("#pedidos .paginacao-conta");
    conferir("a outra tabela continua na página dela",
        /1–5 de 15/.test(contaPedidos || ""), String(contaPedidos));

    /* O paginador fica ABAIXO da tabela, e a tabela ocupa o card.

       Isto não é capricho de layout: o id desta caixa era "produtos", e
       o painel carrega o style.css da loja, onde #produtos é a GRADE da
       vitrine (display:grid com colunas de 155px). A tabela herdava
       isso e nunca ocupou o card inteiro; com o paginador, os dois
       viraram duas colunas e a navegação apareceu POR CIMA das linhas.
       Uma colisão de nome de id entre duas telas diferentes. */
    const geometria = await pagina.evaluate(() => {
        const caixa = document.getElementById("relProdutos");
        const t = caixa.querySelector("table").getBoundingClientRect();
        const p = caixa.querySelector(".paginacao").getBoundingClientRect();
        const c = caixa.getBoundingClientRect();
        return { tabela: t.width / c.width, abaixo: p.top >= t.bottom - 1, display: getComputedStyle(caixa).display };
    });

    conferir(`a tabela ocupa o card — ${Math.round(geometria.tabela * 100)}%`,
        geometria.tabela > 0.9, JSON.stringify(geometria));
    conferir("e a navegação fica abaixo dela, não por cima",
        geometria.abaixo, JSON.stringify(geometria));

    /* Lista que cabe inteira não ganha navegação: seta que não leva a
       lugar nenhum ensina a pessoa a ignorar a seta. */
    await contexto.close();

    const curta = await abrirRelatorios(resumoDeTeste({
        topProdutos: [{ descricao: "Dipirona", ean: "789", unidades: 2, faturamento: 20 }]
    }));

    conferir("tabela de uma linha não mostra navegação",
        await curta.pagina.locator("#relProdutos .paginacao").count() === 0);

    await curta.contexto.close();
}

await navegador.close();

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

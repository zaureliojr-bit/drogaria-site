/* A busca que não achou nada, e a cidade na primeira linha.

   Duas coisas que a loja viu no site da filial de Diadema, no mesmo
   print:

   1. O cliente digitou "Chichlere", o site respondeu "Nenhum produto
      encontrado" e ofereceu — só — tentar outro termo. É o momento em
      que a pessoa está mais perto de ir embora e mais perto de comprar
      ao mesmo tempo: ela acabou de dizer exatamente o que quer.

      E "não achou" quase nunca quer dizer "a farmácia não tem": quer
      dizer que o nome no catálogo é outro, que o produto está no
      balcão e não na extração, ou que a loja encomenda. Quem resolve
      as três é a pessoa do WhatsApp.

   2. A primeira linha da home dizia "Entrega em até 2 horas em São
      Bernardo do Campo" — no site de uma farmácia de Diadema. Mesmo
      vazamento do rodapé e da coordenada do frete: o que está escrito
      no HTML é da primeira farmácia, e o que o cadastro não troca fica
      sendo dela.

   Uso:
     npx wrangler pages dev public --port 8821
     BASE=http://127.0.0.1:8821 CHROME_PATH=... node teste-busca-vazia.mjs
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

const CATALOGO = { produtos: [
    { codigo: "1", ean: "7891106005001", descricao: "Dipirona Sódica 500mg Com/10",
      marca: "EMS", precoVenda: 9.9, categoria: "GENERICO", estoque: 30, temEstoque: true }
] };

const FILIAL = {
    slug: "prudente-01",
    nome: "Drogaria Mais Barato-Prudente",
    logradouro: "Rua Prudente de Morais", numero: "19",
    bairro: "Casa Grande", cidade: "Diadema", uf: "SP", cep: "09960-500",
    whatsapp: "5511951388388",
    farmaceutico: "Dra Maria Tereza", crf: "127136",
    latitude: -23.697469, longitude: -46.597316,
    raio_entrega_km: 8, frete_gratis_acima: 0, fuso: "America/Sao_Paulo"
};

const navegador = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);

async function abrir(loja) {
    const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 } });
    const pagina = await contexto.newPage();

    await pagina.addInitScript(() => {
        navigator.sendBeacon = () => false;
        try { localStorage.setItem("loja-atual", "prudente-01"); } catch { /* nada */ }
    });

    /* A genérica primeiro e a de /loja depois: no Playwright a última
       registrada é consultada antes. Invertido, a genérica engole a de
       /loja e o cadastro nunca é adotado. */
    await pagina.route(/farmatech-pedidos-proxy/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ ok: true, banners: [], encarte: null, promocoes: [] })
    }));

    await pagina.route(/farmatech-pedidos-proxy[^/]*\/loja(\?|$)/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ loja, horario: [], visual: null })
    }));

    await pagina.route(/raw\.githubusercontent|produtos.*\.json/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(CATALOGO)
    }));

    await pagina.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(2500);

    return { pagina, contexto };
}

/* ---- 1. o botão de perguntar ---------------------------------------- */
console.log("\n1. a busca que não achou nada oferece o WhatsApp");
{
    const { pagina, contexto } = await abrir(FILIAL);

    await pagina.fill("#busca", "Chichlere");
    await pagina.waitForTimeout(1200);

    const vazio = await pagina.locator(".aviso-vazio").count();
    conferir("a tela de 'nenhum produto' apareceu", vazio > 0);

    const botao = pagina.locator(".aviso-vazio-whats");
    conferir("e traz o botão de perguntar", await botao.count() > 0);

    const href = await botao.getAttribute("href");

    /* O WhatsApp é o DELA. Sem isto, o cliente de Diadema que não achou
       o produto cairia na conversa da farmácia de São Bernardo — e a
       pessoa do outro lado responderia sobre um estoque que não é o
       que ele vai receber. */
    conferir("no número da farmácia da página",
        (href || "").includes("/5511951388388"), href);

    /* O termo digitado vai junto, como foi escrito: o erro de digitação
       é informação para quem vai responder. */
    conferir("levando o que a pessoa procurou",
        decodeURIComponent(href || "").includes('"Chichlere"'),
        decodeURIComponent(href || ""));

    /* 46px de altura: é o alvo que um dedo acerta. */
    const caixa = await botao.boundingBox();
    conferir(`com alvo de dedo — ${caixa && Math.round(caixa.height)}px`,
        caixa && caixa.height >= 44, JSON.stringify(caixa));

    await contexto.close();
}

/* ---- 2. a cidade da primeira linha ----------------------------------- */
console.log("\n2. o recado de entrega fala da cidade certa");
{
    const { pagina, contexto } = await abrir(FILIAL);

    const recado = (await pagina.textContent(".recado-loja") || "").replace(/\s+/g, " ").trim();

    conferir("diz a cidade DA LOJA", /Diadema/.test(recado), recado);

    /* O defeito, em uma linha: a filial de Diadema prometendo entrega
       em São Bernardo, na primeira tela. */
    conferir("e não a da farmácia principal",
        !/São Bernardo/.test(recado), recado);

    /* O prazo saiu: "2 horas" era promessa de uma loja só, e nenhuma
       filial tem como garanti-la no dia do cadastro. Prazo que o site
       promete e a entrega não cumpre volta como reclamação. */
    conferir("sem prometer um prazo que a filial não combinou",
        !/\d+\s*horas?/i.test(recado), recado);

    conferir("mas continua dizendo que entrega", /entrega/i.test(recado), recado);

    await contexto.close();
}

/* ---- 3. loja sem cidade cadastrada ----------------------------------- */
console.log("\n3. sem cidade no cadastro, a frase continua de pé");
{
    const { pagina, contexto } = await abrir({ ...FILIAL, cidade: "" });

    const recado = (await pagina.textContent(".recado-loja") || "").replace(/\s+/g, " ").trim();

    /* O complemento some; a frase não. Um "Entrega rápida em" solto
       seria pior que não ter a linha. */
    conferir("sobra 'Entrega rápida', sem complemento pendurado",
        /entrega rápida/i.test(recado) && !/\bem\s*$/i.test(recado), recado);

    conferir("e sem a cidade da vizinha", !/São Bernardo/.test(recado), recado);

    await contexto.close();
}

/* ---- 4. o que a farmácia principal NÃO empresta --------------------- */
console.log("\n4. a filial não herda a identidade da vizinha");
{
    /* Uma resposta incompleta — sem CNPJ, sem autorização, sem
       farmacêutico. Em produção o worker manda todas as colunas, mas o
       que esta seção guarda é o comportamento quando alguma falta: ou
       porque uma versão futura do worker parou de mandá-la, ou porque
       alguém cadastrou a filial pela metade.

       A regra antiga era `{...LOJA_PADRAO, ...resposta}`: campo
       ausente virava o da PRIMEIRA farmácia. Três defeitos desta
       sessão saíram daí — o rodapé com a licença sanitária da vizinha,
       o frete medido da loja errada e a cidade errada no recado. */
    const { pagina, contexto } = await abrir({
        slug: "prudente-01",
        nome: "Drogaria Mais Barato-Prudente",
        cidade: "Diadema", uf: "SP",
        whatsapp: "5511951388388"
        /* e mais nada: sem cnpj, sem autorizacao, sem farmacêutico */
    });

    const rodape = (await pagina.textContent(".rodape") || "").replace(/\s+/g, " ");

    conferir("o CNPJ da farmácia principal não vaza",
        !/37\.925\.108/.test(rodape), rodape.slice(0, 160));

    conferir("nem o processo de autorização dela",
        !/25351\.507967/.test(rodape), rodape.slice(0, 200));

    conferir("nem a farmacêutica dela",
        !/Laís Carvalho/.test(rodape), rodape.slice(0, 200));

    /* E o que a filial TEM continua aparecendo: a trava corta a
       herança, não o cadastro. */
    conferir("e o nome da filial continua lá",
        /Prudente/.test(rodape), rodape.slice(0, 120));

    await contexto.close();
}

await navegador.close();

console.log(falhas ? `\n${falhas} falha(s).\n` : "\nTudo certo.\n");
process.exit(falhas ? 1 : 0);

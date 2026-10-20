/* Pedido mínimo de R$ 19,99 em produtos.

   O detalhe que define a regra, e que veio da loja: o mínimo é sobre o
   SUBTOTAL, "19,99 mais a taxa de entrega". Somar a taxa ao mínimo
   deixaria o cliente de bairro distante alcançá-lo com menos remédio
   que o cliente da esquina, pelo mesmo trabalho de separar e entregar.

   E vale só para ENTREGA: o mínimo existe porque sair para entregar
   custa, e quem vem buscar no balcão não dá esse custo.

   Uso:
     BASE=http://127.0.0.1:8821 CHROME_PATH=... node teste-pedido-minimo.mjs
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

const CATALOGO = {
    produtos: [
        { codigo: "1", ean: "7891000000001", descricao: "Dipirona 500mg C/10",
          precoVenda: "9.90", categoria: "GENERICO" },
        { codigo: "2", ean: "7891000000002", descricao: "Protetor Solar FPS 50",
          precoVenda: "14.90", categoria: "PERFUMARIA" },
        /* 16,00 é o preço que monta o caso interessante: com a taxa de
           5,00 o TOTAL passa de 19,99, e mesmo assim o pedido tem de
           ser barrado — faltam 3,99 em PRODUTOS. */
        { codigo: "3", ean: "7891000000003", descricao: "Creme Hidratante 200g",
          precoVenda: "16.00", categoria: "PERFUMARIA" }
    ]
};

const navegador = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);

async function abrirCarrinho(itens) {

    const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 } });
    const pagina = await contexto.newPage();

    /* Perto da loja, para a taxa sair dentro da área de entrega. */
    await pagina.route(/viacep\.com\.br/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ cep: "09751-000", logradouro: "Rua das Flores",
            bairro: "Centro", localidade: "São Bernardo do Campo", uf: "SP" })
    }));

    await pagina.route(/nominatim/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify([{ lat: "-23.69", lon: "-46.56" }])
    }));

    await pagina.route(/produtos.*\.json|raw\.githubusercontent/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(CATALOGO)
    }));

    await pagina.addInitScript((itens) => {
        localStorage.setItem("carrinho", JSON.stringify(itens));
    }, itens);

    await pagina.goto(BASE + "/carrinho", { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(1500);

    return { pagina, contexto };
}

const estado = (pagina) => pagina.evaluate(() => ({
    avisoVisivel: !document.getElementById("avisoMinimo")?.hidden,
    aviso: (document.getElementById("avisoMinimo")?.textContent || "").replace(/\s+/g, " ").trim(),
    botaoBloqueado: !!document.querySelector(".btn-finalizar")?.disabled,
    subtotal: document.getElementById("resumoSubtotal")?.textContent,
    total: document.getElementById("resumoTotal")?.textContent
}));

/* ---- 1. abaixo do mínimo, com entrega --------------------------------- */
console.log("\n1. carrinho de R$ 9,90, com entrega");
{
    const { pagina, contexto } = await abrirCarrinho([
        { codigo: "1", ean: "7891000000001", nome: "Dipirona", preco: 9.9, qtd: 1, imagem: "" }
    ]);

    await pagina.selectOption("#tipoEntrega", "Entrega");
    await pagina.waitForTimeout(400);

    const e = await estado(pagina);

    conferir("o aviso aparece", e.avisoVisivel, JSON.stringify(e));

    /* Diz QUANTO FALTA, não só qual é o mínimo: a primeira frase é uma
       tarefa que o cliente sabe cumprir. 19,99 − 9,90 = 10,09. */
    conferir("dizendo quanto falta, em reais", /10,09/.test(e.aviso), e.aviso);
    conferir("e qual é o mínimo", /19,99/.test(e.aviso), e.aviso);

    conferir("o botão de finalizar fica travado", e.botaoBloqueado);

    await contexto.close();
}

/* ---- 2. a taxa NÃO conta para o mínimo -------------------------------- */
console.log("\n2. a taxa de entrega não ajuda a alcançar o mínimo");
{
    const { pagina, contexto } = await abrirCarrinho([
        { codigo: "3", ean: "7891000000003", nome: "Creme", preco: 16, qtd: 1, imagem: "" }
    ]);

    await pagina.selectOption("#tipoEntrega", "Entrega");
    await pagina.waitForTimeout(400);

    /* A taxa é calculada pelo caminho REAL — endereço, CEP e mapa
       dublados —, e não injetada numa variável.

       A primeira versão deste teste fazia window.freteCalculado = {...},
       que não alcança o `let` do script: a taxa nunca era aplicada e a
       asserção passava sem provar nada. Taxa de mentira não prova que a
       taxa de verdade não conta para o mínimo. */
    await pagina.fill("#cep", "09751000");
    await pagina.locator("#cep").blur();
    await pagina.waitForTimeout(1200);
    await pagina.fill("#numero", "123");

    for (let i = 0; i < 48; i++) {
        const t = await pagina.textContent("#resumoFrete").catch(() => "");
        if (t && !/calcular/i.test(t)) break;
        await pagina.waitForTimeout(250);
    }

    const e = await estado(pagina);

    /* O total, com a taxa, passa de 19,99. O subtotal, não. */
    const numero = (t) => Number(String(t || "").replace(/[^\d,]/g, "").replace(",", "."));
    conferir("a taxa foi mesmo aplicada e o total passou de 19,99",
        numero(e.total) > 19.99 && numero(e.total) > numero(e.subtotal),
        `total ${e.total} · subtotal ${e.subtotal}`);
    conferir("mas o pedido continua barrado", e.botaoBloqueado,
        `total ${e.total} · subtotal ${e.subtotal}`);
    conferir("e ainda faltam 3,99 em produtos", /3,99/.test(e.aviso), e.aviso);

    await contexto.close();
}

/* ---- 3. no mínimo, libera --------------------------------------------- */
console.log("\n3. chegando no mínimo");
{
    const { pagina, contexto } = await abrirCarrinho([
        { codigo: "1", ean: "7891000000001", nome: "Dipirona", preco: 9.9, qtd: 1, imagem: "" },
        { codigo: "2", ean: "7891000000002", nome: "Protetor", preco: 14.9, qtd: 1, imagem: "" }
    ]);

    await pagina.selectOption("#tipoEntrega", "Entrega");
    await pagina.waitForTimeout(400);

    const e = await estado(pagina);

    conferir("subtotal de 24,80 passa do mínimo",
        /24,80/.test(e.subtotal || ""), e.subtotal);
    conferir("o aviso some", !e.avisoVisivel, e.aviso);
    conferir("e o botão libera", !e.botaoBloqueado);

    await contexto.close();
}

/* ---- 4. retirada na loja ---------------------------------------------- */
console.log("\n4. quem vem buscar no balcão não tem mínimo");
{
    const { pagina, contexto } = await abrirCarrinho([
        { codigo: "1", ean: "7891000000001", nome: "Dipirona", preco: 9.9, qtd: 1, imagem: "" }
    ]);

    await pagina.selectOption("#tipoEntrega", "Retirada");
    await pagina.waitForTimeout(400);

    const e = await estado(pagina);

    conferir("nenhum aviso", !e.avisoVisivel, e.aviso);
    conferir("e o botão livre", !e.botaoBloqueado);

    /* E trocar para entrega trava na hora — a regra acompanha a
       escolha, sem precisar recarregar. */
    await pagina.selectOption("#tipoEntrega", "Entrega");
    await pagina.waitForTimeout(400);

    const depois = await estado(pagina);
    conferir("trocar para entrega trava na hora", depois.botaoBloqueado, JSON.stringify(depois));

    await contexto.close();
}

/* ---- 5. a trava vale mesmo sem o botão -------------------------------- */
console.log("\n5. chamar finalizar() direto também é barrado");
{
    const { pagina, contexto } = await abrirCarrinho([
        { codigo: "1", ean: "7891000000001", nome: "Dipirona", preco: 9.9, qtd: 1, imagem: "" }
    ]);

    await pagina.selectOption("#tipoEntrega", "Entrega");
    await pagina.waitForTimeout(400);

    /* O botão desabilitado orienta; a validação é que decide. Sem ela,
       o Enter do teclado ou um clique que escapou entre o recalcular e
       o desenhar passariam. */
    await pagina.evaluate(() => finalizar());
    await pagina.waitForTimeout(600);

    const aviso = await pagina.textContent("#toast").catch(() => "");
    conferir("o envio é recusado com recado",
        /Faltam/i.test(aviso || ""), (aviso || "").trim());

    await contexto.close();
}

await navegador.close();
console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

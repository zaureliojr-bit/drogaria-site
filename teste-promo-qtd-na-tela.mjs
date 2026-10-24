/* As ofertas de quantidade, na tela: vitrine, carrinho e painel.

   A conta já tem teste próprio (teste-promo-qtd.mjs). Aqui se prova o
   que só aparece quando tudo está junto, e que é onde o dinheiro
   escapa:

   1. O TOTAL DA TELA É O TOTAL DA OFERTA. Se o carrinho mostrar R$
      13,50 em três unidades de uma oferta "3 por R$ 10", o cliente
      desiste achando que a promoção não pegou.

   2. A ATENDENTE PRECISA LER A OFERTA NA MENSAGEM. Ela é quem cobra, e
      uma linha de 3 unidades por R$ 10 com a etiqueta marcando R$ 4,50
      parece erro do site. Sem a explicação escrita, ela "corrige" para
      R$ 13,50 — e quem confiou na promoção paga mais caro por causa
      dela.

   3. O PEDIDO GRAVADO LEVA O PREÇO QUE FOI COBRADO. Senão o relatório
      mostra um faturamento que a loja não teve, e ela decide compra em
      cima dele.

   Uso:
     npx wrangler pages dev public --port 8821
     BASE=http://127.0.0.1:8821 CHROME_PATH=... node teste-promo-qtd-na-tela.mjs
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
        { codigo: "1", ean: "7891106003001", descricao: "Fralda Pompom M C/40",
          marca: "Pompom", precoVenda: 59.9, categoria: "FRALDAS", estoque: 50 },
        { codigo: "2", ean: "7891106003002", descricao: "Sabonete Protex 85g",
          marca: "Protex", precoVenda: 4.5, categoria: "SABONETE BARRA", estoque: 80 },
        { codigo: "3", ean: "7891106003003", descricao: "Creme Dental Colgate 90g",
          marca: "Colgate", precoVenda: 7.9, categoria: "HIGIENE BUCAL", estoque: 40 }
    ]
};

/* O sabonete a R$ 4,50 com "3 por R$ 10", e a fralda com leve 3 pague 2. */
const OFERTAS = [
    { codigo: "2", tipo: "pacote", quantidade: 3, preco: 10 },
    { codigo: "1", tipo: "leve-pague", leve: 3, pague: 2 }
];

async function abrirLoja() {

    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 950 } });
    const pagina = await contexto.newPage();

    await pagina.route("**/farmatech-pedidos-proxy*/**", (rota) => {
        const url = new URL(rota.request().url());
        const responder = (dados) => rota.fulfill({
            status: 200, contentType: "application/json",
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(dados)
        });
        if (url.pathname === "/promocoes") {
            return responder({ promocoes: [], quantidade: OFERTAS });
        }
        return responder({ ok: true, produtos: [], promocoes: [], banners: [] });
    });

    await pagina.route(/produtos.*\.json|raw\.githubusercontent/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(CATALOGO)
    }));

    await pagina.goto(BASE + "/loja/mais-barato", { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(2500);

    return { pagina, contexto };
}

const buscar = async (pagina, termo) => {
    await pagina.fill("#busca", termo);
    await pagina.waitForTimeout(900);
};

const apertarMais = async (pagina, codigo, vezes) => {
    for (let i = 0; i < vezes; i++) {
        await pagina.click(`#produtos .card[data-codigo="${codigo}"] [data-acao="mais"]`);
        await pagina.waitForTimeout(150);
    }
};

/* ---- 1. a faixa do card --------------------------------------------- */
console.log("\n1. a oferta aparece na vitrine");
{
    const { pagina, contexto } = await abrirLoja();
    await buscar(pagina, "sabonete");

    const faixa = await pagina.textContent('#produtos .card[data-codigo="2"] .faixa');

    /* "3 por R$ 10,00" é a promoção inteira numa frase. "Oferta"
       sozinho só avisa que existe desconto e manda procurar. */
    conferir("o card diz a oferta por extenso",
        /3 por R\$ ?10,00/.test(faixa || ""), faixa);

    await buscar(pagina, "creme dental");
    const semOferta = await pagina.textContent('#produtos .card[data-codigo="3"] .faixa');
    conferir("produto sem oferta não ganha faixa",
        !/por R\$|Leve/.test(semOferta || ""), semOferta);

    await contexto.close();
}

/* ---- 2. a conta do carrinho ------------------------------------------ */
console.log("\n2. o carrinho cobra o preço da oferta");
{
    const { pagina, contexto } = await abrirLoja();
    await buscar(pagina, "sabonete");

    await apertarMais(pagina, "2", 2);

    let total = await pagina.textContent("#totalTop");
    conferir("duas unidades ainda pagam cheio — R$ 9,00",
        /9,00/.test(total || ""), total);

    /* O convite é o que transforma a promoção em venda: sem ele ela só
       existe para quem já ia levar três. */
    const convite = await pagina.textContent("#itens").catch(() => "");
    await apertarMais(pagina, "2", 1);
    await pagina.waitForTimeout(400);

    total = await pagina.textContent("#totalTop");
    conferir("a terceira fecha o pacote — R$ 10,00",
        /10,00/.test(total || ""), total);

    /* A sobra sai pelo preço normal. Uma conta proporcional cobraria
       R$ 13,33 e a atendente cobraria R$ 14,50. */
    await apertarMais(pagina, "2", 1);
    await pagina.waitForTimeout(400);

    total = await pagina.textContent("#totalTop");
    conferir("a quarta entra pelo preço normal — R$ 14,50",
        /14,50/.test(total || ""), total);

    await contexto.close();
}

/* ---- 3. o que o cliente lê no carrinho ------------------------------- */
console.log("\n3. a explicação, onde o cliente decide");
{
    const { pagina, contexto } = await abrirLoja();
    await buscar(pagina, "sabonete");
    await apertarMais(pagina, "2", 2);

    await pagina.goto(BASE + "/carrinho", { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(2500);

    const texto = (await pagina.textContent("#itens") || "").replace(/\s+/g, " ");

    conferir("o rótulo da oferta aparece", /3 por R\$ ?10,00/.test(texto), texto);

    /* Com 2 no carrinho falta 1. É o empurrão. */
    conferir("e o convite diz o que falta",
        /Leve mais 1/.test(texto), texto);

    await contexto.close();
}

/* ---- 4. a mensagem do WhatsApp --------------------------------------- */
console.log("\n4. o que a atendente lê para cobrar");
{
    const { pagina, contexto } = await abrirLoja();
    await buscar(pagina, "sabonete");
    await apertarMais(pagina, "2", 3);

    await pagina.goto(BASE + "/carrinho", { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(2500);

    /* A mensagem é montada no envio e abre o wa.me. Em vez de
       interceptar a navegação, pede-se ao site a mesma conta e o mesmo
       texto por dentro — é o mesmo código que vai para a URL. */
    const linha = await pagina.evaluate(() => {
        const item = carrinho[0];
        const conta = contaDoItem(item);
        return {
            total: conta.total,
            rotulo: PromoQtd.rotulo(ofertaDoItem(item), item.preco),
            economia: economiaDasOfertas()
        };
    });

    conferir("a linha custa o valor do pacote", linha.total === 10,
        JSON.stringify(linha));

    /* Sem este rótulo na mensagem, a atendente vê 3 unidades por R$ 10
       com a etiqueta marcando R$ 4,50 e "corrige" para R$ 13,50. */
    conferir("com o rótulo que explica o valor",
        linha.rotulo === "3 por R$ 10,00", linha.rotulo);

    conferir("e a economia somada", linha.economia === 3.5,
        String(linha.economia));

    await contexto.close();
}

/* ---- 5. o pedido gravado --------------------------------------------- */
console.log("\n5. o preço que vai para o relatório");
{
    const { pagina, contexto } = await abrirLoja();
    await buscar(pagina, "sabonete");
    await apertarMais(pagina, "2", 3);

    const item = await pagina.evaluate(() => {
        const i = carrinho[0];
        const conta = contaDoItem(i);
        return { qtd: i.qtd, etiqueta: i.preco, enviado: conta.total / i.qtd };
    });

    /* O worker regrava total_item como qtd × preco, e é esse total que
       alimenta o faturamento e "produtos mais vendidos". Mandando o
       preço de etiqueta, a loja veria R$ 13,50 de uma venda de R$ 10 —
       e decidiria compra em cima disso. */
    conferir("o pedido leva o preço cobrado, não o de etiqueta",
        Math.abs(item.enviado * item.qtd - 10) < 0.001,
        JSON.stringify(item));

    conferir("e a etiqueta continua sendo outra coisa",
        item.etiqueta === 4.5, String(item.etiqueta));

    await contexto.close();
}

/* ---- 6. a oferta que encareceu --------------------------------------- */
console.log("\n6. a oferta que ficou mais cara que o preço normal");
{
    /* Acontece quando a planilha é reexportada mais barata e a oferta
       antiga continua no ar. O site precisa ignorá-la sozinho. */
    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 950 } });
    const pagina = await contexto.newPage();

    await pagina.route("**/farmatech-pedidos-proxy*/**", (rota) => {
        const url = new URL(rota.request().url());
        const responder = (dados) => rota.fulfill({
            status: 200, contentType: "application/json",
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(dados)
        });
        if (url.pathname === "/promocoes") {
            return responder({
                /* o sabonete caiu para R$ 2,90: três soltos custam
                   R$ 8,70, menos que os R$ 10 do pacote */
                promocoes: [{ codigo: "2", preco: 2.9 }],
                quantidade: [{ codigo: "2", tipo: "pacote", quantidade: 3, preco: 10 }]
            });
        }
        return responder({ ok: true });
    });

    await pagina.route(/produtos.*\.json|raw\.githubusercontent/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(CATALOGO)
    }));

    await pagina.goto(BASE + "/loja/mais-barato", { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(2500);

    await buscar(pagina, "sabonete");

    const faixa = await pagina.textContent('#produtos .card[data-codigo="2"] .faixa');
    conferir("a oferta some do card", !/3 por/.test(faixa || ""), faixa);

    await apertarMais(pagina, "2", 3);

    const total = await pagina.textContent("#totalTop");
    conferir("e o cliente paga o preço normal — R$ 8,70",
        /8,70/.test(total || ""), total);

    await contexto.close();
}

/* =====================================================================
   PARTE 2 — o painel, onde o número é digitado
   ===================================================================== */

/* O defeito que esta parte existe para impedir de voltar:

     digitado   3 por R$ 19,99
     gravado    3 por R$ 1.999,00
     na tela    "ignorada"

   O <input type="number"> devolve o decimal com PONTO em qualquer
   idioma ("19.99"), e a leitura tratava ponto como separador de
   milhar. A trava que recusa oferta mais cara que o preço normal
   funcionou direito — em cima de um número que ninguém digitou.

   É a pior forma de erro de dinheiro: silenciosa, e com a tela dando
   uma explicação convincente e errada. */

const PRODUTOS_PAINEL = {
    produtos: [
        { codigo: "043024", ean: "7891106004001",
          descricao: "Dipirona 1g Com/10 Comprimidos",
          marca: "EMS", precoVenda: 14.99, categoria: "GENERICO", estoque: 30 }
    ]
};

async function abrirPromocoes() {

    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 950 } });
    const pagina = await contexto.newPage();

    const enviados = [];

    await pagina.route(/raw\.githubusercontent/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(PRODUTOS_PAINEL)
    }));

    await pagina.route("**/farmatech-pedidos-proxy*/**", async (rota) => {

        const url = new URL(rota.request().url());

        const responder = (dados) => rota.fulfill({
            status: 200, contentType: "application/json",
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(dados)
        });

        if (url.pathname === "/promocoes/quantidade" && rota.request().method() === "POST") {
            let corpo = null;
            try { corpo = JSON.parse(rota.request().postData() || "null"); } catch { /* lixo */ }
            enviados.push(corpo);
            return responder({ sucesso: true, gravados: 1 });
        }

        if (url.pathname === "/sessao") {
            return responder({ dono: false, loja: { slug: "mais-barato", nome: "Drogaria Mais Barato", temSenhaPropria: true } });
        }
        if (url.pathname === "/promocoes/todas") {
            return responder({ promocoes: [], lotes: [], quantidade: [] });
        }
        if (url.pathname === "/fila") return responder({ pedidos: [], abertos: ["novo"] });

        return responder({ ok: true, cupons: [], clientes: [], banners: [],
                           promocoes: [], lotes: [], encartes: [], pendente: false });
    });

    await pagina.goto(BASE + "/painel", { waitUntil: "domcontentloaded" });
    await pagina.fill("#senha", "senha-qualquer");
    await pagina.click("#btnEntrar");
    await pagina.waitForSelector("#conteudo:not([style*=\'display: none\'])", { timeout: 20000 });

    await pagina.click('[data-aba="promocoes"]');
    await pagina.waitForSelector("#promoCorpo tr", { timeout: 15000 });

    return { pagina, contexto, enviados };
}

console.log("\n7. o valor digitado é o valor gravado");
{
    const { pagina, contexto, enviados } = await abrirPromocoes();

    await pagina.click('#promoCorpo input[type="checkbox"]');
    await pagina.waitForTimeout(300);

    await pagina.selectOption("#promoQtdTipo", "pacote");
    await pagina.fill("#promoQtdQuantidade", "3");
    await pagina.fill("#promoQtdPreco", "19.99");

    pagina.once("dialog", (d) => d.accept());
    await pagina.click("#promoQtdAplicar");
    await pagina.waitForTimeout(1200);

    const corpo = enviados[0] || {};

    /* 1999 era o que chegava ao banco. Três unidades a R$ 14,99 custam
       R$ 44,97, então a oferta "mais cara" era recusada e a tela dizia
       "ignorada" — uma explicação convincente para um número que
       ninguém digitou. */
    conferir("o preço do pacote vai como 19,99, e não 1999",
        corpo.preco === 19.99, JSON.stringify(corpo));

    conferir("e a quantidade também", corpo.quantidade === 3, JSON.stringify(corpo));

    await contexto.close();
}

console.log("\n8. e a oferta volta a valer");
{
    /* A prova do outro lado: com 19,99 de verdade, a mesma trava que
       recusava agora aceita — ela nunca esteve errada. */
    const conta = (q) => ({
        tipo: "pacote", quantidade: 3, preco: 19.99, qtd: q
    });

    const contexto = await navegador.newContext();
    const pagina = await contexto.newPage();
    await pagina.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(1500);

    const resultado = await pagina.evaluate(() => ({
        certo: PromoQtd.rotulo({ tipo: "pacote", quantidade: 3, preco: 19.99 }, 14.99),
        errado: PromoQtd.rotulo({ tipo: "pacote", quantidade: 3, preco: 1999 }, 14.99),
        total: PromoQtd.aplicar({ tipo: "pacote", quantidade: 3, preco: 19.99 }, 3, 14.99).total
    }));

    conferir("3 por R$ 19,99 numa dipirona de R$ 14,99 é oferta",
        resultado.certo === "3 por R$ 19,99", resultado.certo);

    conferir("e três unidades custam 19,99", resultado.total === 19.99,
        String(resultado.total));

    /* A trava continua de pé para o caso que ela existe para pegar. */
    conferir("3 por R$ 1.999,00 continua sendo ignorada",
        resultado.errado === "", resultado.errado);

    await contexto.close();
}

await navegador.close();

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

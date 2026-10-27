/* O "de" que a loja não consegue sustentar.

   O caso é real e estava na primeira tela do site: Rivaroxabana 15mg
   "de R$ 227,50 por R$ 34,99". R$ 227,50 parece ser o preço de
   referência da marca que veio junto no cadastro, não um preço que
   esta farmácia praticou. São 38 produtos assim em quase sete mil — e
   o carrossel da home, que ordena por maior desconto, punha
   justamente eles nas primeiras posições.

   O que este teste fixa:

     1. o produto continua à venda, e pelo preço de promoção. Desligar
        a oferta devolveria o preço de tabela ao cliente — cobrar
        R$ 227,50 por causa de uma correção de vitrine seria trocar um
        problema por um muito pior;
     2. o que some é só a AFIRMAÇÃO: o "de" riscado e o "−85%";
     3. ele não lidera a home;
     4. e o desconto normal não é afetado por nada disso.

   Uso:
     npx wrangler pages dev public --port 8821 --binding DOMINIO_PLATAFORMA=teste.local
     BASE=http://127.0.0.1:8821 CHROME_PATH=... node teste-desconto-suspeito.mjs
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
        /* O caso real, com os números do catálogo publicado. */
        { codigo: "1", ean: "7891106000001", descricao: "Rivaroxabana 15mg Com/30 Comprimidos",
          precoVenda: "227.50", precoPromocao: "34.99", categoria: "GENERICO",
          estoque: 9, imagem: "https://exemplo.invalido/riva.jpg" },

        /* Oferta de verdade: 20% de desconto num item de higiene. */
        { codigo: "2", ean: "7891106000002", descricao: "Sabonete Liquido 200ml",
          precoVenda: "10.00", precoPromocao: "8.00", categoria: "HIGIENE",
          estoque: 30, imagem: "https://exemplo.invalido/sab.jpg" },

        { codigo: "3", ean: "7891106000003", descricao: "Shampoo Anticaspa 200ml",
          precoVenda: "25.00", precoPromocao: "19.90", categoria: "CABELO",
          estoque: 12, imagem: "https://exemplo.invalido/sham.jpg" },

        { codigo: "4", ean: "7891106000004", descricao: "Creme Dental 90g",
          precoVenda: "9.00", precoPromocao: "6.99", categoria: "HIGIENE",
          estoque: 25, imagem: "https://exemplo.invalido/creme.jpg" }
    ]
};

const navegador = await chromium.launch({ executablePath: process.env.CHROME_PATH });

async function abrir(caminho) {
    const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 } });
    const pagina = await contexto.newPage();

    await pagina.route(/produtos.*\.json|raw\.githubusercontent/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(CATALOGO)
    }));

    /* As fotos não existem; o que importa é o texto. Sem isto cada card
       espera o tempo todo de uma imagem que nunca vem. */
    await pagina.route(/exemplo\.invalido/, (r) => r.abort());

    await pagina.goto(BASE + caminho, { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(3000);

    return { pagina, contexto };
}

/* ---- 1. o produto continua à venda, pelo preço certo ---------------- */
console.log("\n1. o preço do cliente não muda");
{
    const { pagina, contexto } = await abrir("/loja/mais-barato");

    await pagina.fill("#busca", "rivaroxabana");
    await pagina.waitForTimeout(800);

    const card = pagina.locator('#produtos .card[data-codigo="1"]');
    const texto = (await card.textContent() || "").replace(/\s+/g, " ");

    /* A asserção que impede o conserto de virar desastre: o cliente paga
       34,99. Se um dia alguém "corrigir" isto desligando o emOferta, o
       preço vira 227,50 e este teste cai. */
    conferir("o cliente continua vendo R$ 34,99", /34,99/.test(texto), texto);
    conferir("e o preço de tabela não vira o preço de venda",
        !/R\$ ?227,50/.test(texto.replace("R$227,50", "R$ 227,50")), texto);

    /* O que some é a comparação. */
    conferir("o 'de' riscado não aparece", !/227,50/.test(texto), texto);
    conferir("nem a pílula de desconto", !/8[0-9]%/.test(texto), texto);
    conferir("nem a faixa 'Oferta' no topo do card",
        await card.locator(".faixa-oferta").count() === 0, "faixa de oferta presente");

    /* E a oferta de verdade continua inteira. */
    await pagina.fill("#busca", "sabonete");
    await pagina.waitForTimeout(800);

    const normal = pagina.locator('#produtos .card[data-codigo="2"]');
    const textoNormal = (await normal.textContent() || "").replace(/\s+/g, " ");

    conferir("o desconto normal continua mostrando o 'de'",
        /10,00/.test(textoNormal), textoNormal);
    conferir("e a porcentagem", /20%/.test(textoNormal), textoNormal);
    conferir("e a faixa de oferta",
        await normal.locator(".faixa-oferta").count() === 1, "sem faixa de oferta");

    await contexto.close();
}

/* ---- 2. a primeira tela do site ------------------------------------- */
console.log("\n2. a primeira fileira da home não lidera com ele");
{
    const { pagina, contexto } = await abrir("/loja/mais-barato");

    /* A pergunta é a mesma; a superfície mudou.

       Ela nasceu para a tira "Ofertas do dia", que ordenava por maior
       desconto e por isso promovia, por construção, o dado mais
       duvidoso do catálogo para o lugar mais visível do site. A tira
       saiu — a loja achou que não combinava com a página —, e quem
       ocupa a primeira fileira agora é "Destaques da semana", que
       também põe promoção na frente. O risco migrou junto. */
    const fileira = (await pagina.textContent("#listaMaisVendidos") || "").replace(/\s+/g, " ");

    conferir("a Rivaroxabana não está nos destaques da home",
        !/Rivaroxabana/.test(fileira), fileira.slice(0, 160));

    conferir("e a fileira não fica vazia por causa disso",
        /Sabonete|Shampoo|Creme/.test(fileira), fileira.slice(0, 160));

    await contexto.close();
}

/* ---- 3. a página do produto ----------------------------------------- */
console.log("\n3. a mesma regra na página de compra");
{
    const { pagina, contexto } = await abrir(
        "/loja/mais-barato/produto/rivaroxabana-15mg-com-30-comprimidos-7891106000001");

    const texto = (await pagina.textContent("#produtoDetalhe") || "").replace(/\s+/g, " ");

    conferir("a página mostra o preço de venda", /34,99/.test(texto), texto.slice(0, 200));
    conferir("e não repete a comparação", !/227,50/.test(texto), texto.slice(0, 200));

    await contexto.close();
}

await navegador.close();

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

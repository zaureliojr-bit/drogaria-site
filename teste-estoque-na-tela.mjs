/* O estoque na tela, do lado do cliente.

   O teste-estoque.mjs prova a regra; este prova que ela está LIGADA nos
   três lugares que têm botão "+" — o card da vitrine, a página do
   produto e a página do carrinho. Uma trava ligada em um só deixaria os
   outros dois aceitando o pedido que a prateleira não tem.

   E prova a parte que o cliente pediu: a página do produto diz quantas
   unidades existem quando são poucas, e volta a dizer só "disponível"
   quando o número não ajudaria a decidir nada.

   Uso:
     node stub-porteiro.mjs &
     npx wrangler pages dev public --port 8821 --binding DOMINIO_PLATAFORMA=teste.local
     BASE=http://127.0.0.1:8821 CHROME_PATH=... node teste-estoque-na-tela.mjs
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

/* Dois produtos, e o contraste entre eles é o teste inteiro:
   um com 2 unidades (número na tela, carrinho trava em 2) e um com 40
   (nenhum número na tela, carrinho trava no teto de segurança). */
const CATALOGO = {
    produtos: [
        { codigo: "1", ean: "7891106000888", descricao: "Dipirona 500mg C/10",
          precoVenda: "19.90", categoria: "GENERICO", estoque: 2 },
        { codigo: "2", ean: "7891106000999", descricao: "Fralda Geriatrica M",
          precoVenda: "49.90", categoria: "HIGIENE", estoque: 40 }
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

    await pagina.goto(BASE + caminho, { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(3000);

    return { pagina, contexto };
}

/* A grade só aparece depois de uma busca ou de um filtro — na home o
   que está montado é o carrossel de destaques. Buscar é o caminho que o
   cliente faz, então é o que o teste faz. */
async function buscar(pagina, termo) {
    await pagina.fill("#busca", termo);
    await pagina.waitForTimeout(800);
}

/* Aperta o "+" do card n vezes e devolve o que o stepper marca. */
async function apertarMais(pagina, codigo, vezes) {
    const card = `#produtos .card[data-codigo="${codigo}"]`;
    for (let i = 0; i < vezes; i++) {
        await pagina.click(`${card} [data-acao="mais"]`);
        await pagina.waitForTimeout(150);
    }
    return (await pagina.textContent(`${card} .controle span`) || "").trim();
}

/* ---- 1. o card da vitrine ------------------------------------------- */
console.log("\n1. o '+' do card para onde o estoque para");
{
    const { pagina, contexto } = await abrir("/loja/mais-barato");
    await buscar(pagina, "dipirona");

    /* Cinco toques num produto que tem 2. Antes disto o carrinho aceitava
       os cinco, e a conta só aparecia no WhatsApp — com a farmacêutica
       avisando o cliente de que vai faltar parte do pedido. */
    const marcado = await apertarMais(pagina, "1", 5);
    conferir("cinco toques num produto de 2 unidades param em 2",
        marcado === "2", marcado);

    /* Não fica em silêncio: botão que não responde faz o cliente achar
       que o site travou. */
    const aviso = await pagina.textContent("#toast").catch(() => "");
    conferir("e a tela diz quantas existem",
        /2 unidades/.test(aviso || ""), aviso || "(sem aviso)");

    /* O que o carrinho guardou é o que vai no pedido — é ele, e não o
       número na tela, que a farmacêutica vai separar. */
    const noCarrinho = await pagina.evaluate(() => {
        const bruto = localStorage.getItem("carrinho") || "[]";
        return (JSON.parse(bruto).find(i => String(i.codigo) === "1") || {}).qtd;
    });
    conferir("e o carrinho salvo também tem 2", noCarrinho === 2, String(noCarrinho));

    /* Estoque alto não trava na primeira dúzia por acidente: quem compra
       fralda compra mais de duas. */
    await buscar(pagina, "fralda");
    const outro = await apertarMais(pagina, "2", 6);
    conferir("produto com estoque folgado não trava em 6", outro === "6", outro);

    await contexto.close();
}

/* ---- 2. a página do produto ----------------------------------------- */
console.log("\n2. a página do produto diz quantas são — quando são poucas");
{
    const { pagina, contexto } = await abrir("/loja/mais-barato/produto/dipirona-500mg-c-10-7891106000888");

    const texto = (await pagina.textContent(".produto-estoque") || "").trim();
    conferir("com 2 unidades, o número aparece", /2 unidades/.test(texto), texto);
    conferir("e não é pintado como erro",
        await pagina.locator(".produto-estoque.poucas").count() === 1, texto);

    /* A trava vale aqui também: esta página tem botão próprio — o
       primeiro clique é "Adicionar ao carrinho", e só depois ele vira
       contador. */
    await pagina.click('#acoesDetalhe [data-acao="comprar"]');
    await pagina.waitForTimeout(200);
    for (let i = 0; i < 4; i++) {
        await pagina.click('#acoesDetalhe [data-acao="mais"]');
        await pagina.waitForTimeout(150);
    }
    const marcado = (await pagina.textContent("#acoesDetalhe .controle span") || "").trim();
    conferir("e o '+' da página também para em 2", marcado === "2", marcado);

    await contexto.close();
}

console.log("\n3. estoque folgado não enche a tela de número");
{
    const { pagina, contexto } = await abrir("/loja/mais-barato/produto/fralda-geriatrica-m-7891106000999");

    const texto = (await pagina.textContent(".produto-estoque") || "").trim();

    /* O ponto: o estoque vem de uma extração que roda uma vez por dia,
       enquanto a loja vende no balcão o dia inteiro. "Restam 40" visto
       às 18h não ajuda ninguém a decidir — só deixa a loja devendo
       explicação por um número que envelheceu. */
    conferir("acima da fronteira, nenhum número na tela",
        !/\d/.test(texto) && /Disponível/.test(texto), texto);

    await contexto.close();
}

/* ---- 4. a página do carrinho, e o carrinho de ontem ----------------- */
console.log("\n4. o carrinho guardado no aparelho também é conferido");
{
    const { pagina, contexto } = await abrir("/carrinho.html");

    /* Cinco unidades salvas ontem, quando havia cinco. A extração desta
       manhã diz duas. Sem a conferência o pedido fecharia com cinco: o
       carrinho mora no aparelho, e ninguém na loja saberia antes de
       separar. */
    await pagina.evaluate(() => localStorage.setItem("carrinho", JSON.stringify([
        { codigo: "1", ean: "7891106000888", nome: "Dipirona 500mg C/10",
          preco: 19.9, qtd: 5 }
    ])));

    await pagina.reload({ waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(3000);

    const naTela = (await pagina.textContent('.item .item-qtd span') || "").trim();
    conferir("as 5 de ontem descem para as 2 de hoje", naTela === "2", naTela);

    const salvo = await pagina.evaluate(() => {
        const bruto = localStorage.getItem("carrinho") || "[]";
        return (JSON.parse(bruto)[0] || {}).qtd;
    });
    conferir("e o corte é gravado, não só desenhado", salvo === 2, String(salvo));

    /* Terceira porta com botão "+": a mesma trava tem de valer aqui. */
    await pagina.click('.item .item-qtd [data-acao="mais"]');
    await pagina.waitForTimeout(250);
    const depois = (await pagina.textContent('.item .item-qtd span') || "").trim();
    conferir("e o '+' do carrinho não passa do estoque", depois === "2", depois);

    await contexto.close();
}

await navegador.close();

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

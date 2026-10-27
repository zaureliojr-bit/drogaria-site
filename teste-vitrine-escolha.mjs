/* O que a home ESCOLHE mostrar.

   Dois blocos da primeira dobra não mostram o catálogo inteiro: eles
   escolhem. "Destaques da semana" escolhe 12 produtos e a tira "Ofertas
   do dia" escolhe as promoções. Escolher é o que separa uma vitrine de
   uma lista — e é também o que transforma a home em propaganda.

   DOIS DEFEITOS QUE ESTE TESTE EXISTE PARA NÃO DEIXAR VOLTAR

   1. Os dois filtravam por `!p.exigeReceita`, acreditando no nome. No
      produto mapeado esse campo quer dizer "não entra no carrinho", que
      hoje são só as listas A e B da Portaria 344 — tarja vermelha passa
      reto. Foi assim que Finasterida 5mg e Carvedilol 25mg, as duas
      tarja V, foram parar na primeira tela do site com preço riscado.
      Anunciar medicamento sob prescrição ao público é o que a RDC
      96/2008 proíbe.

   2. Os destaques eram um sorteio do catálogo inteiro. No site
      publicado, os dois primeiros produtos que o cliente via eram
      Esmalte Impala R$ 4,99 e sandália Havaiana R$ 44,99 — numa
      farmácia. Quem chega procurando remédio conclui que não é aqui e
      vai embora antes de buscar, que é o degrau onde o funil perde 67%.

   O catálogo daqui é falso de propósito e desenhado para pegar os dois:
   tem tarja V sem bloqueio presencial (o caso da Finasterida), tem
   controlado por categoria sem tarja nenhuma (o caso do Bactrim), e tem
   oito itens de uma família só, para o rodízio ter o que evitar.

   Uso:
     npx wrangler pages dev public --port 8821
     BASE=http://127.0.0.1:8821 CHROME_PATH=... node teste-vitrine-escolha.mjs
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

let seq = 0;
const item = (extra) => {
    seq++;
    return {
        codigo: String(seq),
        ean: "789110600" + String(5000 + seq),
        descricao: `Produto ${seq}`,
        marca: "ACME",
        precoVenda: 50,
        estoque: 20,
        temEstoque: true,
        imagem: "https://exemplo.invalido/foto.webp",
        ...extra
    };
};

/* Oito esmaltes: é a família que dominava o sorteio antigo. Se o
   rodízio por família não funcionar, eles tomam a fileira. */
const ESMALTES = Array.from({ length: 8 }, () =>
    item({ categoria: "ESMALTES", descricao: `Esmalte ${seq + 1}`, precoVenda: 4.99 }));

const CATALOGO = { produtos: [
    ...ESMALTES,

    /* Os que NÃO podem aparecer. Todos em promoção e com foto, de
       propósito: assim eles seriam os primeiros da fila se o filtro
       falhasse — é a posição exata em que a Finasterida apareceu. */
    item({ descricao: "Finasterida 5mg C/30", categoria: "GENER/SIMILAR S/GT",
           tarja: "V", precoVenda: 145.94, precoPromocao: 44.99 }),
    item({ descricao: "Carvedilol 25mg C/30", categoria: "GENERICO",
           tarja: "V", precoVenda: 65.16, precoPromocao: 19.99 }),
    item({ descricao: "Bactrim F Com/14", categoria: "ETICO CONTROLADO",
           precoVenda: 40, precoPromocao: 15 }),
    item({ descricao: "Rivotril 2mg C/30", categoria: "ETICO CONTROLADO",
           tarja: "P", precoVenda: 30, precoPromocao: 9 }),

    /* Os que PODEM: sem tarja, de famílias diferentes. */
    item({ descricao: "Dipirona 500mg Com/10", categoria: "GENERICO",
           precoVenda: 12, precoPromocao: 8.99 }),
    item({ descricao: "Protetor Solar FPS 60", categoria: "PROTETOR SOLAR",
           precoVenda: 70, precoPromocao: 49.9 }),
    item({ descricao: "Fralda Infantil M C/30", categoria: "LINHA INFANTIL" }),
    item({ descricao: "Shampoo Anticaspa 200ml", categoria: "SHAMPOO" }),
    item({ descricao: "Vitamina C 1g C/10", categoria: "VITAMINAS" }),
    item({ descricao: "Creme Dental 90g", categoria: "HIGIENE BUCAL" }),
    item({ descricao: "Desodorante Aerosol", categoria: "DESODORANTE" }),
    item({ descricao: "Soro Fisiológico 500ml", categoria: "GENERICO" })
] };

const navegador = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);

const contexto = await navegador.newContext({ viewport: { width: 1280, height: 1000 } });
const pagina = await contexto.newPage();

await pagina.addInitScript(() => { navigator.sendBeacon = () => false; });

await pagina.route(/farmatech-pedidos-proxy/, (rota) => rota.fulfill({
    status: 200, contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ ok: true, banners: [], encarte: null, loja: null,
                           promocoes: [], quantidade: [] })
}));

await pagina.route(/raw\.githubusercontent|produtos.*\.json/, (rota) => rota.fulfill({
    status: 200, contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(CATALOGO)
}));

await pagina.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await pagina.waitForTimeout(3000);

const vitrine = await pagina.evaluate(() => ({
    destaques: (typeof maisVendidos !== "undefined" ? maisVendidos : [])
        .map(p => ({ nome: p.nome, familia: p.familia })),
    naTela: [...document.querySelectorAll("#listaMaisVendidos .card-mini")]
        .map(c => (c.textContent || "").replace(/\s+/g, " ").trim()),
    ofertas: [...document.querySelectorAll(".banner-item b")]
        .map(b => (b.textContent || "").trim())
}));

const PROIBIDOS = ["Finasterida", "Carvedilol", "Bactrim", "Rivotril"];

/* ---- 1. nada que precise de receita ---------------------------------- */
console.log("\n1. receita não vai para a vitrine");
{
    const nomes = vitrine.destaques.map(p => p.nome).join(" | ");
    const vazou = PROIBIDOS.filter(x => nomes.includes(x));

    conferir("nenhum tarjado ou controlado nos destaques",
        vazou.length === 0, vazou.join(", ") + "  em: " + nomes);

    const naTira = vitrine.ofertas.join(" | ");
    const vazouTira = PROIBIDOS.filter(x => naTira.includes(x));

    /* A tira é o bloco mais colorido da home e ordena por maior
       desconto: um tarjado em promoção ia, por construção, para a
       primeira posição da primeira tela. */
    conferir("nem na tira de Ofertas do dia",
        vazouTira.length === 0, vazouTira.join(", ") + "  em: " + naTira);
}

/* ---- 2. a promoção da loja vem antes ---------------------------------- */
console.log("\n2. a escolha da loja tem precedência");
{
    conferir("os destaques não vieram vazios",
        vitrine.destaques.length > 0, String(vitrine.destaques.length));

    const primeiros = vitrine.destaques.slice(0, 3).map(p => p.nome).join(" | ");

    /* Promoção cadastrada é a única curadoria humana que o sistema tem
       hoje, e o sorteio antigo a ignorava. */
    conferir("os primeiros são produtos em promoção",
        /Dipirona|Protetor Solar/.test(primeiros), primeiros);
}

/* ---- 3. uma farmácia, não oito esmaltes -------------------------------- */
console.log("\n3. a fileira mostra a farmácia inteira");
{
    const familias = vitrine.destaques.map(p => p.familia);
    const distintas = new Set(familias);

    /* O defeito visto no site publicado: o sorteio não tinha nenhuma
       razão para não devolver oito itens da mesma família, e devolveu
       esmalte e chinelo nas duas primeiras posições. */
    conferir(`há variedade de famílias — ${distintas.size} em ${familias.length}`,
        distintas.size >= 4, [...distintas].join(", "));

    const beleza = familias.filter(f => f === "beleza").length;
    conferir(`nenhuma família domina a fileira — beleza aparece ${beleza}x`,
        beleza <= 2, JSON.stringify(familias));
}

/* ---- 4. e o que está na tela é o que foi escolhido --------------------- */
console.log("\n4. a tela desenha a escolha");
{
    conferir("os cards desenhados batem com a lista",
        vitrine.naTela.length === vitrine.destaques.length,
        `${vitrine.naTela.length} cards / ${vitrine.destaques.length} escolhidos`);

    const textoNaTela = vitrine.naTela.join(" | ");
    const vazouNaTela = PROIBIDOS.filter(x => textoNaTela.includes(x));
    conferir("e nenhum proibido chegou ao HTML",
        vazouNaTela.length === 0, vazouNaTela.join(", "));
}

await contexto.close();
await navegador.close();

console.log(falhas ? `\n${falhas} falha(s).\n` : "\nTudo certo.\n");
process.exit(falhas ? 1 : 0);

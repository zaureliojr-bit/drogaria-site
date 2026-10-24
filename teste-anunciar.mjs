/* A regra do "o que anunciar nesta semana".

   Três coisas aqui custam dinheiro de verdade se saírem erradas, e é
   nelas que o teste insiste:

   1. ANUNCIAR O QUE EXIGE RECEITA. Não é só errado: a RDC 96/2008
      proíbe, e Google e Meta suspendem a conta. A loja perderia junto
      as campanhas que estavam certas.

   2. ANUNCIAR O QUE ESTÁ ACABANDO. Paga-se o clique, o cliente chega,
      não acha, e aprende que o site mente sobre o estoque. É o pior
      resultado possível de uma campanha — pior que não anunciar.

   3. ANUNCIAR O QUE A LOJA NÃO TEM. "Procuraram e não acharam" é lista
      de compras, não de anúncio. Misturar as duas é o erro natural de
      quem olha os dois relatórios na mesma tela.

   Uso: node teste-anunciar.mjs
*/

import { readFileSync } from "node:fs";

const fonte = readFileSync(new URL("./public/anunciar.js", import.meta.url), "utf8");
const receita = readFileSync(new URL("./public/receita.js", import.meta.url), "utf8");
const familias = readFileSync(new URL("./public/familias.js", import.meta.url), "utf8");

/* Os três no mesmo escopo, como o painel carrega. O familias.js é o
   que traduz a categoria do PDV ("ETICO CONTROLADO") em família — e é
   dele que sai a decisão de receita na maioria das linhas, porque o
   catálogo publicado NÃO traz tarja. */
const caixa = {};
new Function("globalThis",
    familias + "\nglobalThis.familiaDe = familiaDe;\n" + receita + "\n" + fonte
).call(caixa, caixa);
const { Anunciar } = caixa;

let falhas = 0;
const conferir = (d, c, det = "") => {
    if (c) console.log(`  ok   ${d}`);
    else { console.log(`  FALHA ${d}${det ? "  → " + det : ""}`); falhas++; }
};

/* A categoria é obrigatória aqui porque é obrigatória na vida: ela vem
   do Farmax da própria farmácia e é o campo que decide o que é
   medicamento. "FRALDAS" é o padrão por ser o caso que PODE ser
   anunciado — o teste que quer um remédio diz isso explicitamente. */
const produto = (extras) => Object.assign({
    codigo: "1", ean: "7891000000001", nome: "Produto Qualquer",
    categoria: "FRALDAS",
    preco: 20, promo: 0, estoque: 50, tarja: ""
}, extras);

const LOJA = { nome: "Drogaria Mais Barato", entrega: "até 2 horas",
               site: "https://mais-barato.drogalink.com.br" };

/* ---- 1. remédio nunca entra ------------------------------------------ */
console.log("\n1. o que a farmácia não pode anunciar");
{
    /* As categorias são as DO CATÁLOGO DE VERDADE, tiradas do
       produtos.json publicado. Foi o que furou a primeira versão desta
       regra: ela olhava só um campo `tarja` que o catálogo quase nunca
       traz, e um Bactrim ("ETICO CONTROLADO", sem tarja) passava. */
    const produtos = [
        produto({ codigo: "A", nome: "Bactrim F C/10 Comprimidos",
                  categoria: "ETICO CONTROLADO" }),
        produto({ codigo: "B", nome: "Amoxicilina 500mg Com/21",
                  categoria: "GENERICO" }),
        produto({ codigo: "C", nome: "Aspirina C Efervescente C/20",
                  categoria: "CARTELADOS" }),
        produto({ codigo: "D", nome: "Selene 35 Com/21",
                  categoria: "ANTICONCEPCIONAL" }),
        produto({ codigo: "E", nome: "Fralda Pompom M C/40",
                  categoria: "FRALDAS" })
    ];

    const { sugestoes } = Anunciar.sugerir({
        produtos, loja: LOJA,
        maisProcurados: [
            { termo: "bactrim", buscas: 90 },
            { termo: "amoxicilina", buscas: 80 },
            { termo: "aspirina", buscas: 70 },
            { termo: "selene", buscas: 60 },
            { termo: "fralda pompom", buscas: 10 }
        ]
    });

    const nomes = sugestoes.map(s => s.nome);

    /* Os quatro proibidos são justamente os mais buscados. Uma regra
       que ordenasse só por demanda poria os quatro no topo — e a conta
       da loja no Google e no Meta seria suspensa. */
    conferir("o controlado não entra",
        !nomes.some(n => /Bactrim/.test(n)), JSON.stringify(nomes));
    conferir("o antibiótico não entra",
        !nomes.some(n => /Amoxicilina/.test(n)), JSON.stringify(nomes));
    conferir("o anticoncepcional não entra",
        !nomes.some(n => /Selene/.test(n)), JSON.stringify(nomes));

    /* Este é o que surpreende, e é deliberado: a aspirina é venda
       livre. A RDC 96/2008 deixa anunciá-la, mas exigindo do anúncio a
       frase de advertência, o registro na ANVISA e o princípio ativo
       legível — coisas que um post montado neste painel não carrega.
       Sugerir o remédio e deixar o dono montar o resto seria entregar
       uma infração pronta. */
    conferir("nem o medicamento de venda livre",
        !nomes.some(n => /Aspirina/.test(n)), JSON.stringify(nomes));

    conferir("sobrou a fralda, que é onde o anúncio de farmácia vende",
        nomes.length === 1 && /Fralda/.test(nomes[0]), JSON.stringify(nomes));
}

/* ---- 1.5. a peneira sem o receita.js carregado ----------------------- */
console.log("\n1.5. e se o receita.js não estiver na página");
{
    /* A tela carrega os três arquivos, mas um erro de ordem no HTML
       deixaria o anunciar.js sozinho. Na dúvida ele recusa — o custo de
       deixar passar é a conta suspensa; o de recusar demais é uma
       sugestão a menos. */
    const sozinho = {};
    new Function("globalThis",
        familias + "\nglobalThis.familiaDe = familiaDe;\n" + fonte
    ).call(sozinho, sozinho);

    conferir("sem o receita.js, o controlado continua barrado",
        sozinho.Anunciar.exigeReceita({ categoria: "ETICO CONTROLADO" }), "");

    conferir("e o medicamento comum também",
        !sozinho.Anunciar.podeSerAnunciado({ categoria: "GENERICO" }), "");

    conferir("a fralda continua liberada",
        sozinho.Anunciar.podeSerAnunciado({ categoria: "FRALDAS" }), "");
}

/* ---- 2. o que está acabando ------------------------------------------ */
console.log("\n2. não se anuncia o que vai faltar");
{
    const produtos = [
        produto({ codigo: "A", ean: "111", nome: "Fralda Pompom M C/40", estoque: 60 }),
        produto({ codigo: "B", ean: "222", nome: "Fralda Huggies M C/40", estoque: 80 })
    ];

    const { sugestoes } = Anunciar.sugerir({
        produtos, loja: LOJA,
        maisProcurados: [{ termo: "fralda pompom", buscas: 30 },
                         { termo: "fralda huggies", buscas: 25 }],
        /* a aba Estoque já sabe quem está rompendo — é esse dado que
           entra aqui como veto */
        vaoRomper: [{ ean: "111", codigo: "A" }]
    });

    const nomes = sugestoes.map(s => s.nome);

    conferir("a fralda que vai romper sai da lista",
        !nomes.some(n => /Pompom/.test(n)), JSON.stringify(nomes));
    conferir("e a que tem estoque fica",
        nomes.some(n => /Huggies/.test(n)), JSON.stringify(nomes));
}

/* ---- 3. estoque pequeno demais --------------------------------------- */
console.log("\n3. estoque que não aguenta campanha");
{
    const produtos = [
        produto({ codigo: "A", nome: "Protetor Solar FPS 50", estoque: 2 }),
        produto({ codigo: "B", nome: "Protetor Labial FPS 30", estoque: 40 })
    ];

    const { sugestoes } = Anunciar.sugerir({
        produtos, loja: LOJA,
        maisProcurados: [{ termo: "protetor solar", buscas: 50 },
                         { termo: "protetor labial", buscas: 10 }]
    });

    /* Duas unidades e 50 buscas: é o caso em que a demanda grita e a
       prateleira não responde. Anunciar seria pagar clique para 48
       pessoas que não vão comprar. */
    conferir("duas unidades não viram anúncio",
        !sugestoes.some(s => /Protetor Solar/.test(s.nome)),
        JSON.stringify(sugestoes.map(s => s.nome)));
}

/* ---- 4. a ordem das sugestões ---------------------------------------- */
console.log("\n4. o que vem primeiro");
{
    const produtos = [
        produto({ codigo: "A", nome: "Shampoo Anticaspa 200ml", estoque: 30 }),
        produto({ codigo: "B", nome: "Creme Dental 90g", estoque: 90, preco: 10, promo: 7 }),
        produto({ codigo: "C", ean: "333", nome: "Condicionador 300ml", estoque: 40 })
    ];

    const { sugestoes } = Anunciar.sugerir({
        produtos, loja: LOJA,
        maisProcurados: [{ termo: "shampoo", buscas: 18 }],
        parado: [{ ean: "333", codigo: "C", dias_parado: 95, dinheiro: 420 }]
    });

    /* Demanda provada primeiro. O resto é hipótese nossa; a busca é
       gente de verdade tendo procurado. */
    conferir("o que já procuram vem na frente",
        sugestoes[0] && /Shampoo/.test(sugestoes[0].nome),
        JSON.stringify(sugestoes.map(s => s.tipo + ":" + s.nome)));

    const tipos = sugestoes.map(s => s.tipo);
    conferir("depois o que está com desconto",
        tipos[1] === "oferta", JSON.stringify(tipos));
    conferir("e por último o dinheiro parado",
        tipos[2] === "parado", JSON.stringify(tipos));

    /* O motivo tem de caber numa frase que o dono leia sem explicação —
       é ele que decide se vai gastar os R$ 80. */
    conferir("cada sugestão diz por que está ali",
        sugestoes.every(s => s.motivo && s.motivo.length > 10),
        JSON.stringify(sugestoes.map(s => s.motivo)));
}

/* ---- 5. uma busca só não é demanda ----------------------------------- */
console.log("\n5. ruído não vira campanha");
{
    const produtos = [produto({ nome: "Cereal Infantil Mucilon 400g" })];

    const { sugestoes } = Anunciar.sugerir({
        produtos, loja: LOJA,
        maisProcurados: [{ termo: "mucilon", buscas: 1 }]
    });

    /* Uma busca pode ser o próprio dono conferindo se o produto entrou
       no site. Construir uma campanha em cima disso é construir em cima
       de nada. */
    conferir("uma busca sozinha não vira sugestão",
        sugestoes.length === 0, JSON.stringify(sugestoes.map(s => s.nome)));
}

/* ---- 6. o que falta é lista de compras ------------------------------- */
console.log("\n6. 'procuraram e não acharam' não é anúncio");
{
    const produtos = [produto({ nome: "Dipirona Sódica 500mg Com/10" })];

    const { sugestoes, faltando } = Anunciar.sugerir({
        produtos, loja: LOJA,
        maisProcurados: [{ termo: "dipirona", buscas: 10 }],
        naoEncontrados: [{ termo: "ozempic", buscas: 14 },
                         { termo: "creatina", buscas: 9 },
                         { termo: "xpto", buscas: 1 }]
    });

    conferir("o que a loja não tem vem separado",
        faltando.length === 2, JSON.stringify(faltando));

    /* O erro que este teste existe para impedir: o termo não encontrado
       virar sugestão de anúncio. O cliente clicaria, não acharia, e a
       loja teria pago por isso. */
    conferir("e não entra na lista de anúncios",
        !sugestoes.some(s => /ozempic/i.test(s.nome)),
        JSON.stringify(sugestoes.map(s => s.nome)));

    conferir("o que foi buscado uma vez só não vira compra também",
        !faltando.some(f => f.termo === "xpto"), JSON.stringify(faltando));
}

/* ---- 7. o texto e o link --------------------------------------------- */
console.log("\n7. o que vai colado no anúncio");
{
    const produtos = [produto({
        nome: "Fralda Pompom M C/40", preco: 59.9, promo: 49.9, estoque: 40
    })];

    const { sugestoes } = Anunciar.sugerir({
        produtos, loja: LOJA, campanha: "instagram-outubro",
        maisProcurados: [{ termo: "fralda pompom", buscas: 22 }]
    });

    const s = sugestoes[0];

    conferir("o preço do anúncio é o de promoção", /49,90/.test(s.texto), s.texto);
    conferir("com o nome da loja", /Mais Barato/.test(s.texto), s.texto);
    conferir("e o prazo de entrega", /2 horas/.test(s.texto), s.texto);

    /* Anúncio de farmácia que promete resultado é anúncio reprovado —
       pela ANVISA e pelas próprias plataformas. O texto se limita a
       nome, preço e entrega. */
    conferir("sem promessa de resultado",
        !/cura|melhor|garantid|trata|alívio|eficaz/i.test(s.texto), s.texto);

    conferir("o link leva para a loja",
        s.link.indexOf("https://mais-barato.drogalink.com.br") === 0, s.link);

    /* Pelo EAN, não pelo nome: o índice de busca do site inclui o
       código de barras, e os dois levam ao mesmo produto — mas um cabe
       numa bio de Instagram e o outro vira três linhas de %20. */
    conferir("e é curto o bastante para um anúncio",
        /busca=7891000000001/.test(s.link) && s.link.length < 90, s.link);

    /* Sem o carimbo não há como saber depois se a campanha vendeu — que
       é o motivo inteiro de a aba existir. */
    conferir("e já vem carimbado com a campanha",
        /[?&]c=instagram-outubro/.test(s.link), s.link);
}

/* ---- 8. loja sem nada para anunciar ---------------------------------- */
console.log("\n8. semana sem sugestão");
{
    const { sugestoes, faltando } = Anunciar.sugerir({ produtos: [], loja: LOJA });

    /* Melhor devolver vazio que inventar. Uma sugestão fraca gasta o
       dinheiro da loja do mesmo jeito que uma boa. */
    conferir("não inventa sugestão", sugestoes.length === 0, String(sugestoes.length));
    conferir("nem lista de compras", faltando.length === 0, String(faltando.length));
}

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

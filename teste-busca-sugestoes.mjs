/* O que aparece enquanto o cliente digita.

   Nome de remédio é comprido e tem dosagem no meio — "Dipirona Sódica
   500mg Com/10". Quem está com dor de cabeça não quer escrever tudo:
   quer ver a palavra e tocar nela. Mas sugestão mal ordenada é pior
   que nenhuma, porque ocupa a tela inteira do celular com o que a
   pessoa não quis.

   Uso: node teste-busca-sugestoes.mjs
*/

await import("./public/busca.js");
const { sugerir, partesDoDestaque, MINIMO_DE_LETRAS } = globalThis.Busca;

let falhas = 0;
function conferir(descricao, condicao, detalhe = "") {
    if (condicao) console.log(`  ok   ${descricao}`);
    else {
        console.log(`  FALHA ${descricao}${detalhe ? "  → " + detalhe : ""}`);
        falhas++;
    }
}

/* Como o catálogo chega do mapearProduto: `busca` é o índice que a
   grade já usa (nome + marca + laboratório + EAN, sem acento). */
const semAcento = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const criar = (nome, extras = {}) => ({
    nome,
    marca: extras.marca || "",
    ean: extras.ean || "7891106000001",
    codigo: extras.codigo || "1",
    preco: extras.preco || 10,
    temEstoque: extras.temEstoque,
    busca: semAcento([nome, extras.marca, extras.laboratorio].filter(Boolean).join(" "))
});

const CATALOGO = [
    criar("Dipirona Sódica 500mg Com/10", { marca: "Neo Química" }),
    criar("Dipirona Sódica Monoidratada 500mg Com/10 Genérico", { marca: "EMS" }),
    criar("Dipirona Gotas 20ml", { marca: "Medley" }),
    criar("Adesivo Dipirona Infantil Kit", { marca: "Generico" }),
    criar("Paracetamol 750mg Com/20", { marca: "EMS" }),
    criar("Protetor Solar FPS 50", { marca: "Nivea" }),
    criar("Shampoo Anticaspa 200ml", { marca: "Clear" })
];

/* ---- 1. a pessoa começando a digitar -------------------------------- */
console.log("\n1. uma letra não é uma busca");
{
    conferir("com uma letra, nenhuma sugestão",
        sugerir(CATALOGO, "d").length === 0, String(sugerir(CATALOGO, "d").length));

    conferir("vazio também não", sugerir(CATALOGO, "").length === 0);
    conferir("espaço também não", sugerir(CATALOGO, "  ").length === 0);

    conferir(`e o mínimo está documentado — ${MINIMO_DE_LETRAS}`,
        MINIMO_DE_LETRAS === 2, String(MINIMO_DE_LETRAS));

    /* Catálogo ainda não carregou: a lista não pode explodir. */
    conferir("sem catálogo, lista vazia em vez de erro",
        sugerir(undefined, "dip").length === 0 && sugerir([], "dip").length === 0);
}

/* ---- 2. a ordem, que é o teste todo --------------------------------- */
console.log("\n2. o que vem primeiro quando se digita 'dip'");
{
    const lista = sugerir(CATALOGO, "dip");
    const nomes = lista.map((s) => s.nome);

    conferir("achou as dipironas e o adesivo", lista.length === 4, JSON.stringify(nomes));

    /* Quem COMEÇA com o digitado antes de quem só contém: "Adesivo
       Dipirona" contém "dip", mas não é o que se quis dizer. */
    conferir("o adesivo, que só contém, vai para o fim",
        nomes[nomes.length - 1] === "Adesivo Dipirona Infantil Kit", JSON.stringify(nomes));

    /* Entre duas dipironas, a de nome mais curto é a que a pessoa
       reconhece. */
    conferir("o nome mais curto vem antes do mais comprido",
        nomes[0] === "Dipirona Gotas 20ml", JSON.stringify(nomes));

    conferir("e a monoidratada, mais comprida, fica depois da simples",
        nomes.indexOf("Dipirona Sódica 500mg Com/10") <
        nomes.indexOf("Dipirona Sódica Monoidratada 500mg Com/10 Genérico"),
        JSON.stringify(nomes));
}

/* ---- 3. não sugerir o que não dá para comprar ------------------------ */
console.log("\n3. o esgotado não lidera a lista");
{
    const comEsgotado = [
        criar("Dipirona Gotas 20ml", { temEstoque: false }),
        criar("Dipirona Sódica 500mg Com/10")
    ];

    const nomes = sugerir(comEsgotado, "dip").map((s) => s.nome);

    /* Sugerir primeiro o que está esgotado é mandar a pessoa bater na
       porta fechada — mesmo sendo o nome mais curto, que é o critério
       que ganharia se o estoque não fosse olhado. */
    conferir("o disponível vem antes, mesmo com nome maior",
        nomes[0] === "Dipirona Sódica 500mg Com/10", JSON.stringify(nomes));

    conferir("e o esgotado continua na lista, não some",
        nomes.length === 2, JSON.stringify(nomes));
}

/* ---- 4. uma linha por nome ------------------------------------------ */
console.log("\n4. o mesmo produto não ocupa a lista inteira");
{
    /* O PDV tem duplicata: o mesmo item cadastrado duas vezes, com
       códigos diferentes. Três linhas iguais não ajudam a escolher. */
    const comRepetido = [
        criar("Dipirona Sódica 500mg Com/10", { codigo: "1" }),
        criar("Dipirona Sódica 500mg Com/10", { codigo: "2" }),
        criar("DIPIRONA SÓDICA 500MG COM/10", { codigo: "3" }),
        criar("Dipirona Gotas 20ml", { codigo: "4" })
    ];

    const nomes = sugerir(comRepetido, "dipirona").map((s) => s.nome);

    conferir("duas linhas, não quatro", nomes.length === 2, JSON.stringify(nomes));

    /* Nem o mesmo nome escrito em caixa alta. */
    conferir("caixa alta é o mesmo nome",
        !(nomes[0].toUpperCase() === nomes[1]?.toUpperCase()), JSON.stringify(nomes));
}

/* ---- 5. acento e marca ---------------------------------------------- */
console.log("\n5. quem digita sem acento acha");
{
    conferir("'sodica' acha 'Sódica'",
        sugerir(CATALOGO, "sodica").length === 2,
        JSON.stringify(sugerir(CATALOGO, "sodica").map((s) => s.nome)));

    /* O índice é nome + marca + laboratório, o mesmo que a grade
       filtra. Sugerir por um critério e filtrar por outro levaria a
       uma lista que não contém a sugestão. */
    const porMarca = sugerir(CATALOGO, "nivea");
    conferir("dá para achar pela marca",
        porMarca.length === 1 && /Protetor Solar/.test(porMarca[0].nome),
        JSON.stringify(porMarca.map((s) => s.nome)));
}

/* ---- 6. o destaque do que foi digitado ------------------------------ */
console.log("\n6. o pedaço digitado, para a tela poder grifar");
{
    const p = partesDoDestaque("Dipirona Sódica 500mg Com/10", "dip");
    conferir("corta no lugar certo",
        p.antes === "" && p.meio === "Dip" && p.depois === "irona Sódica 500mg Com/10",
        JSON.stringify(p));

    /* O caso que quebra um recorte ingênuo: o acento antes do trecho
       procurado. Se a normalização mudar o comprimento do texto, o
       índice anda e o grifo sai no meio da palavra errada. */
    const comAcento = partesDoDestaque("Dipirona Sódica 500mg", "sodica");
    conferir("acento antes do trecho não desloca o corte",
        comAcento.meio === "Sódica", JSON.stringify(comAcento));

    conferir("as três partes remontam o nome original",
        comAcento.antes + comAcento.meio + comAcento.depois === "Dipirona Sódica 500mg",
        JSON.stringify(comAcento));

    const nada = partesDoDestaque("Dipirona", "xyz");
    conferir("sem casar, devolve o nome inteiro e não quebra",
        nada.antes === "Dipirona" && nada.meio === "", JSON.stringify(nada));
}

/* ---- 7. o limite ----------------------------------------------------- */
console.log("\n7. a lista não toma a tela");
{
    const muitos = Array.from({ length: 50 }, (_, i) => criar(`Dipirona Tipo ${i} 500mg`));

    conferir("no máximo 6 por padrão",
        sugerir(muitos, "dipirona").length === 6,
        String(sugerir(muitos, "dipirona").length));

    conferir("e o limite é configurável",
        sugerir(muitos, "dipirona", { limite: 3 }).length === 3);
}

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

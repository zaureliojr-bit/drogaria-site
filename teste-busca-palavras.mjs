/* Como a busca casa o que o cliente digitou.

   NASCEU DE UMA BUSCA REAL QUE DEU ZERO: "tinta de cabelo vermelho",
   num dia em que a loja tinha 12 produtos exatos do que o cliente
   queria. Ela falhava em três camadas empilhadas:

     1. casava a FRASE INTEIRA como um pedaço de texto
        (`p.busca.includes(termo)`), então qualquer busca de três
        palavras morria;
     2. o índice era só nome + marca + laboratório + EAN. A palavra
        "cabelo" só existia no nome da FAMÍLIA, que a busca não via;
     3. o cliente diz "tinta"; o catálogo diz "Coloração" e "Tintura
        Capilar" — 323 produtos fora do alcance da palavra dele.

   A terceira não tem conserto automático: é vocabulário de balcão, e
   quem sabe é a farmácia. Por isso o site NÃO inventa sinônimo — ele
   usa o que a loja ensinou no painel, e este arquivo prova as duas
   metades (com lista e sem).

   O que mais importa aqui, porém, é o que NÃO pode quebrar: busca por
   nome de remédio. Quem digita "dipirona" tem de receber dipirona, e
   não meia loja.

   Uso:
     npx wrangler pages dev public --port 8821
     BASE=http://127.0.0.1:8821 CHROME_PATH=... node teste-busca-palavras.mjs
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
const item = (descricao, extra = {}) => ({
    codigo: String(++seq),
    ean: "789" + String(1000000000 + seq),
    descricao,
    marca: "ACME",
    precoVenda: 20,
    estoque: 10,
    imagem: "https://exemplo.invalido/foto.webp",
    ...extra
});

/* O catálogo reproduz o caso real: os produtos de coloração NÃO dizem
   "tinta" nem "cabelo" — quem diz "cabelo" é a família (TINTURA cai em
   Cabelo), e "tinta" não diz ninguém. */
const CATALOGO = { produtos: [
    item("Coloração Maxton Kit 50g 06.66 Vermelho Cereja", { categoria: "TINTURA" }),
    item("Tintura Capilar Permanente Niely Cor&Ton 5.546 Vermelho", { categoria: "TINTURA" }),
    item("Coloração Excellence Kit 8 Louro Claro", { categoria: "TINTURA" }),

    /* Para a palavra curta: "c" não pode casar dentro de "Cápsulas". */
    item("Vitamina C Gotas 20ml", { categoria: "VITAMINAS" }),
    item("Vitamina D3 Com 30 Cápsulas", { categoria: "VITAMINAS" }),
    item("Creme Hidratante Corporal 200ml", { categoria: "HIDRATANTE" }),

    /* Para o que não pode regredir. */
    item("Dipirona Sódica 500mg C/10 Comprimidos", { categoria: "GENERICO" }),
    item("Adesivo Para Dipirona", { categoria: "GENERICO" }),
    item("Dorflex 12 Comprimidos", { categoria: "ETICO" })
] };

const COM_LISTA = {
    versao: 1,
    rotulos: {},
    sinonimos: { tinta: ["coloracao", "tintura"] }
};

const navegador = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);

async function abrir({ dicionario = COM_LISTA } = {}) {
    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
    const pagina = await contexto.newPage();

    await pagina.route(/farmatech-pedidos-proxy/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" }, body: "{}" }));

    await pagina.route(/referencias\/subcategorias/, (r) => r.fulfill(
        dicionario === null
            ? { status: 404, body: "" }
            : { status: 200, contentType: "application/json",
                headers: { "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify(dicionario) }));

    await pagina.route(/raw\.githubusercontent|produtos.*\.json/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(CATALOGO) }));

    await pagina.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await pagina.waitForTimeout(2500);
    await pagina.keyboard.press("Escape").catch(() => {});

    const buscar = (termo) => pagina.evaluate((t) => {
        el("busca").value = t;
        buscar();
        return produtosFiltrados.map((p) => p.nome);
    }, termo);

    return { pagina, contexto, buscar };
}

/* ---- 1. o caso que trouxe isto --------------------------------------- */
console.log("\n1. \"tinta de cabelo vermelho\"");
{
    const { contexto, buscar } = await abrir();
    const achou = await buscar("tinta de cabelo vermelho");

    conferir(`acha os dois vermelhos — ${achou.length}`, achou.length === 2,
        JSON.stringify(achou));

    /* Três palavras, três fontes diferentes: "tinta" vem do sinônimo,
       "cabelo" do nome da família, "vermelho" do nome do produto.
       Nenhuma delas sozinha resolveria. */
    conferir("e não traz o louro, que não é vermelho",
        !achou.some((n) => /Louro/.test(n)), JSON.stringify(achou));

    /* A ordem importa num resultado de busca: o que tem a palavra no
       NOME vem antes de quem só está na mesma família. */
    conferir("o primeiro é uma coloração vermelha",
        /Vermelh/i.test(achou[0] || ""), achou[0]);

    await contexto.close();
}

/* ---- 2. sem a lista da loja, o site não inventa ---------------------- */
console.log("\n2. sem o dicionário no ar");
{
    const { contexto, buscar } = await abrir({ dicionario: null });

    /* Sinônimo de farmácia é vocabulário de balcão. Se o site chutasse
       que "tinta" é "coloração", chutaria também que "dor" é qualquer
       analgésico — e aí traria o que não alivia. */
    const comTinta = await buscar("tinta de cabelo vermelho");
    conferir("\"tinta\" não vira coloração sozinha", comTinta.length === 0,
        JSON.stringify(comTinta));

    /* Mas a busca por palavra continua de pé: o dicionário só ensina
       vocabulário, não é do que a busca depende para funcionar. */
    const semTinta = await buscar("coloracao vermelho");
    conferir(`e "coloração vermelho" acha assim mesmo — ${semTinta.length}`,
        semTinta.length === 1, JSON.stringify(semTinta));

    await contexto.close();
}

/* ---- 3. palavra curta casa inteira ----------------------------------- */
console.log("\n3. \"vitamina c\" não é \"vitamina\" + qualquer coisa com C");
{
    const { contexto, buscar } = await abrir();
    const achou = await buscar("vitamina c");

    /* Na primeira versão desta busca, "vitamina c" devolvia 299
       produtos no catálogo real: o "c" casava como início de
       "Cápsulas", "Creme", "Com". */
    conferir(`acha só a vitamina C — ${achou.length}`, achou.length === 1,
        JSON.stringify(achou));
    conferir("e não a D3, que tem 'Cápsulas'",
        !achou.some((n) => /D3/.test(n)), JSON.stringify(achou));

    /* Da terceira letra em diante vale o começo da palavra, e é isso
       que faz "vermelho" achar "Vermelho Cereja". */
    const verm = await buscar("vermelh");
    conferir(`"vermelh" acha os dois pelo começo — ${verm.length}`,
        verm.length === 2, JSON.stringify(verm));

    await contexto.close();
}

/* ---- 4. o que não podia quebrar -------------------------------------- */
console.log("\n4. busca por nome de remédio não regrediu");
{
    const { contexto, buscar } = await abrir();

    const dip = await buscar("dipirona");
    conferir(`"dipirona" acha as duas — ${dip.length}`, dip.length === 2,
        JSON.stringify(dip));

    /* E na ordem certa: quem COMEÇA com o que foi digitado vem antes de
       quem tem a palavra no meio. */
    conferir("a dipirona de verdade antes do adesivo",
        /^Dipirona/.test(dip[0] || ""), JSON.stringify(dip));

    const dor = await buscar("dorflex");
    conferir("\"dorflex\" acha só o dorflex",
        dor.length === 1 && /Dorflex/.test(dor[0]), JSON.stringify(dor));

    await contexto.close();
}

/* ---- 5. caractere especial não derruba a vitrine --------------------- */
console.log("\n5. o que o cliente digita vira expressão regular");
{
    const { contexto, buscar, pagina } = await abrir();

    /* "c/10" e "50%" existem em nome de produto de farmácia. Sem
       escapar, a barra e o parêntese estouram a expressão regular e a
       vitrine inteira para de responder. */
    const barra = await buscar("c/10");
    conferir(`"c/10" responde sem quebrar — ${barra.length}`,
        Array.isArray(barra) && barra.length >= 1, JSON.stringify(barra));

    for (const perigoso of ["50%", "(500", "a+b", "[x]", "c\\d"]) {
        const r = await buscar(perigoso).catch(() => null);
        conferir(`"${perigoso}" não derruba a página`, r !== null, "estourou");
    }

    /* E a página continua viva depois de tudo isso. */
    const viva = await pagina.evaluate(() => typeof produtosFiltrados !== "undefined");
    conferir("a vitrine continua de pé", viva);

    await contexto.close();
}

/* ---- 6. todas as palavras, e as de ligação ---------------------------- */
console.log("\n6. quem digita mais palavras está estreitando");
{
    const { contexto, buscar } = await abrir();

    /* E, não OU: "coloracao louro" não pode trazer as vermelhas só
       porque elas também são coloração. */
    const duas = await buscar("coloracao louro");
    conferir(`"coloração louro" acha uma só — ${duas.length}`,
        duas.length === 1 && /Louro/.test(duas[0]), JSON.stringify(duas));

    /* As ligações saem: "creme para o rosto" tem duas palavras que
       importam, e exigir "para" e "o" só derrubaria o resultado. */
    const comLigacao = await buscar("creme para o corpo");
    conferir(`"creme para o corpo" acha o corporal — ${comLigacao.length}`,
        comLigacao.length === 1, JSON.stringify(comLigacao));

    /* Mas se SOBRAR só ligação, vale o que foi digitado: quem busca
       "de" merece o comportamento antigo, não a loja inteira. */
    const soLigacao = await buscar("de");
    conferir("\"de\" não devolve o catálogo inteiro",
        soLigacao.length < CATALOGO.produtos.length, String(soLigacao.length));

    await contexto.close();
}

await navegador.close();

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

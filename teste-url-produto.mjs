/* Prova que as três pontas do endereço do produto concordam.

   São três funções em três arquivos, que têm de ser inversas umas das
   outras ou o site anuncia endereços que ele mesmo não abre:

     slugificar()      public/script.js          monta o link do card
     slugificar()      scripts/gerar-sitemap.mjs monta o link do sitemap
     separar()+
     desslugificar()   functions/produto/[[rota]].js   lê de volta

   Cada seção abaixo testa um jeito de isso dar errado. As duas que mais
   me preocupam: nome que TERMINA em número (o "50x2" sendo confundido
   com o código de barras) e EAN que não bate entre o link e a leitura.

   Uso: node teste-url-produto.mjs
*/

import { readFileSync } from "node:fs";

/* ---- as funções, lidas dos arquivos de verdade ---------------------

   Copiar o corpo delas para cá daria um teste que passa para sempre,
   inclusive depois de alguém mudar o site. Então são extraídas do
   próprio arquivo: se a do script.js mudar, este teste vê. */

function extrair(arquivo, nome) {
    const texto = readFileSync(new URL(arquivo, import.meta.url), "utf8");
    const inicio = texto.indexOf(`function ${nome}(`);
    if (inicio < 0) throw new Error(`não achei a função ${nome}() em ${arquivo}`);

    let i = texto.indexOf("{", inicio);
    let nivel = 0;
    for (let fim = i; fim < texto.length; fim++) {
        if (texto[fim] === "{") nivel++;
        else if (texto[fim] === "}") {
            nivel--;
            if (nivel === 0) {
                return eval(`(${texto.slice(inicio, fim + 1).replace(`function ${nome}`, "function")})`);
            }
        }
    }
    throw new Error(`a função ${nome}() em ${arquivo} não fecha`);
}

const slugificarSite = extrair("./public/script.js", "slugificar");
const slugificarSitemap = extrair("./scripts/gerar-sitemap.mjs", "slugificar");
const separar = extrair("./functions/produto/[[rota]].js", "separar");
const desslugificar = extrair("./functions/produto/[[rota]].js", "desslugificar");
/* A urlProduto() chama a slugificar() do próprio script.js. Extraída
   para cá ela perde esse vizinho, então ele é devolvido no escopo
   global — e é a função de verdade, não uma imitação. */
globalThis.slugificar = slugificarSite;
const urlProduto = extrair("./public/script.js", "urlProduto");

let falhas = 0;
function conferir(descricao, condicao, detalhe = "") {
    if (condicao) {
        console.log(`  ok   ${descricao}`);
    } else {
        console.log(`  FALHA ${descricao}${detalhe ? "  → " + detalhe : ""}`);
        falhas++;
    }
}

const CASOS = [
    { nome: "Aspirina C Efervescente Limao Display C/ 50x2 Comprimidos", ean: "7891106000888" },
    { nome: "Dipirona Sódica 500mg 20 Comprimidos", ean: "7896112139829" },
    { nome: "Bismu-Jet SoluçãO Gts 20ml", ean: "7891317000011" },
    { nome: "Buscopan 10mg/Ml SoluçAo Oral 20ml", ean: "7891106915328" },
    { nome: "Tylenol 750", ean: "7891010244323" },          // termina em número
    { nome: "Leite Ninho 400", ean: "78912345" },            // EAN-8, nome com número
    { nome: "Vitamina C 1g 30", ean: "78963210000012" },     // GTIN-14
    { nome: "   ---   ", ean: "7890000000017" },             // nome que slugifica para nada
    { nome: "Álcool 70% 1L", ean: "7896541000013" }
];

console.log("\n1. o link do card e o do sitemap são o MESMO endereço");
for (const c of CASOS) {
    conferir(
        `"${c.nome}"`,
        slugificarSite(c.nome) === slugificarSitemap(c.nome),
        `card="${slugificarSite(c.nome)}" sitemap="${slugificarSitemap(c.nome)}"`
    );
}

console.log("\n2. o servidor recupera o EAN exato do endereço gerado");
for (const c of CASOS) {
    const url = urlProduto({ nome: c.nome, ean: c.ean, codigo: "000001" });
    const rota = url.replace(/^\/produto\//, "");
    const { ean } = separar(rota);
    conferir(`"${c.nome}" → ${c.ean}`, ean === c.ean, `veio "${ean}" de "${rota}"`);
}

console.log("\n3. nome que termina em número não vira código de barras");
{
    const url = urlProduto({ nome: "Tylenol 750", ean: "7891010244323", codigo: "1" });
    const { nome, ean } = separar(url.replace(/^\/produto\//, ""));
    conferir("o EAN é o do fim", ean === "7891010244323", `veio ${ean}`);
    conferir("o 750 ficou no nome", nome === "tylenol-750", `veio "${nome}"`);
    conferir("e volta legível", desslugificar(nome) === "Tylenol 750", desslugificar(nome));
}

console.log("\n4. o nome volta em formato de título");
conferir(
    "acento se perde, o resto não",
    desslugificar("dipirona-sodica-500mg-20-comprimidos") === "Dipirona Sodica 500mg 20 Comprimidos",
    desslugificar("dipirona-sodica-500mg-20-comprimidos")
);
conferir(
    "palavra que começa com dígito fica intacta",
    desslugificar("vitamina-c-1g-30") === "Vitamina C 1g 30",
    desslugificar("vitamina-c-1g-30")
);

console.log("\n5. produto sem EAN cai no endereço antigo, por código");
{
    const url = urlProduto({ nome: "Qualquer Coisa", ean: "", codigo: "000123" });
    conferir("vai para /produto?codigo=", url === "/produto?codigo=000123", url);
}
{
    const url = urlProduto({ nome: "Coisa", ean: "123", codigo: "000124" });
    conferir("EAN curto demais também", url === "/produto?codigo=000124", url);
}

console.log("\n6. endereço sem EAN nenhum não derruba o servidor");
for (const rota of ["", "qualquer-coisa", "123", "produto/", "-"]) {
    const { nome, ean } = separar(rota);
    conferir(`"${rota}" → sem EAN, sem exceção`, ean === "" || /^\d{8,14}$/.test(ean), `ean="${ean}" nome="${nome}"`);
}

console.log("\n7. o slug não passa de 120 caracteres");
{
    const longo = "Fralda Descartavel Super Jumbo Tamanho Extra Grande Com Abas Elasticas E Indicador De Umidade Pacote Economico Com Setenta E Duas Unidades";
    const slug = slugificarSite(longo);
    conferir("cortado", slug.length <= 120, `${slug.length} caracteres`);
    const { ean } = separar(`${slug}-7891234567890`);
    conferir("e o EAN ainda é lido", ean === "7891234567890", ean);
}

console.log("\n8. o catálogo de verdade, se estiver à mão");
try {
    const bruto = readFileSync(process.env.CATALOGO || "/dev/null", "utf8");
    const lista = JSON.parse(bruto).produtos || [];
    let erros = 0;
    for (const p of lista) {
        const ean = String(p.ean || "").replace(/\D/g, "");
        if (ean.length < 8 || !p.descricao) continue;
        const url = urlProduto({ nome: p.descricao, ean, codigo: p.codigo });
        if (separar(url.replace(/^\/produto\//, "")).ean !== ean) {
            if (erros < 5) console.log(`    "${p.descricao}" → ${url}`);
            erros++;
        }
    }
    conferir(`${lista.length} produtos: todo EAN volta inteiro`, erros === 0, `${erros} erraram`);
} catch {
    console.log("  (pulado — rode com CATALOGO=/caminho/produtos.json para incluir)");
}

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

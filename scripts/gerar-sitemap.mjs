/* =====================================================================
   Gera o public/sitemap-produtos.xml a partir do catálogo publicado.
   =====================================================================

   POR QUE ISTO RODA NO GITHUB E NÃO NA PAGES

   O caminho natural seria uma função servir o sitemap na hora. Medimos:
   ler o produtos.json (2,6 MB) e montar as 6.800 URLs custa 48 ms de
   CPU, e o plano Free da Cloudflare dá 10 ms por requisição. Nem com
   extração por expressão regular em vez de JSON.parse cabe (22 ms).

   Então o arquivo é gerado fora: o .github/workflows/sitemap.yml roda
   este script todo dia, na CPU do GitHub, e comita o resultado se ele
   mudou. A Pages serve um arquivo estático, de graça, em CPU zero.

   O lado ruim, dito na cara: o sitemap fica no máximo um dia atrás do
   catálogo. Para produto novo isso é irrelevante — o Google leva mais
   de um dia para rastrear de qualquer jeito.

   CUIDADO AO EDITAR

   A slugificar() daqui tem de ser idêntica à do public/script.js, que
   monta os links, e casar com a desslugificar() da
   functions/produto/[[rota]].js, que lê o nome de volta. Se as três
   divergirem, o sitemap anuncia endereços que o site não gera — e o
   Google registra 6.800 páginas órfãs.
   ===================================================================== */

import { writeFile, readFile } from "node:fs/promises";

const CATALOGO =
    "https://raw.githubusercontent.com/zaureliojr-bit/Produtos/refs/heads/main/produtos.json";

const SITE = "https://drogaria-site.pages.dev";
const SAIDA = new URL("../public/sitemap-produtos.xml", import.meta.url);

/* Limite do protocolo: 50.000 URLs por arquivo. Hoje são 6.800 — a
   verificação está aqui para a rede de farmácias, quando o catálogo for
   a soma de várias lojas. */
const MAX_URLS = 50000;

function slugificar(texto) {
    return String(texto || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 120);
}

function escapar(texto) {
    return String(texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

const resposta = await fetch(CATALOGO);
if (!resposta.ok) {
    console.error(`o catálogo respondeu ${resposta.status} — nada foi gravado`);
    process.exit(1);
}

const dados = await resposta.json();
const lista = dados.produtos || [];

if (!lista.length) {
    /* Catálogo vazio é quase sempre falha de publicação, não loja sem
       produto. Sobrescrever o sitemap com zero URLs diria ao Google que
       o site inteiro saiu do ar — então falha e mantém o arquivo antigo. */
    console.error("o catálogo veio sem produtos — nada foi gravado");
    process.exit(1);
}

/* Mesmo filtro do site: o script.js descarta produto sem EAN ou sem
   descrição antes de mostrar. O sitemap não pode anunciar o que a
   vitrine não abre. */
const vistos = new Set();
const urls = [];

for (const p of lista) {
    const ean = String(p.ean || "").replace(/\D/g, "");
    if (ean.length < 8 || !p.descricao) continue;
    if (vistos.has(ean)) continue;
    vistos.add(ean);

    const slug = slugificar(p.descricao);
    urls.push(`${SITE}/produto/${slug ? slug + "-" : ""}${ean}`);

    if (urls.length >= MAX_URLS) break;
}

const hoje = new Date().toISOString().slice(0, 10);

const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!-- Gerado por scripts/gerar-sitemap.mjs. Não edite à mão. -->\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
        .map(
            (u) =>
                `  <url><loc>${escapar(u)}</loc><lastmod>${hoje}</lastmod>` +
                `<changefreq>weekly</changefreq><priority>0.6</priority></url>`
        )
        .join("\n") +
    `\n</urlset>\n`;

/* Compara antes de gravar, ignorando a data: o lastmod muda todo dia
   mesmo quando nenhum produto mudou, e sem isto o robô comitaria 6.800
   linhas por dia só para trocar a data. */
const semData = (t) => t.replace(/<lastmod>[^<]*<\/lastmod>/g, "");

let antigo = "";
try {
    antigo = await readFile(SAIDA, "utf8");
} catch {
    /* primeira execução */
}

if (antigo && semData(antigo) === semData(xml)) {
    console.log(`sem mudança: ${urls.length} produtos, o arquivo fica como está`);
    process.exit(0);
}

await writeFile(SAIDA, xml, "utf8");
console.log(`gravado: ${urls.length} páginas de produto (${(xml.length / 1024).toFixed(0)} KB)`);

/* A aba Reativação, dentro do painel.

   O que está sendo provado:

     1. a aba existe no painel — e NÃO mais dentro do padronizador, que
        era um quadro dentro de uma aba, dois níveis para baixo;
     2. telefone fixo aparece como fixo e sem botão de WhatsApp. É o
        defeito que trouxe esta tela para cá: antes virava um celular de
        outra pessoa, com o nome de um cliente da farmácia junto;
     3. duas fichas do mesmo telefone viram uma linha, com o MENOR
        "dias sem comprar" — o número verdadeiro;
     4. "não perturbe" tira da lista e continua valendo depois de
        reimportar a mesma planilha;
     5. abrir o WhatsApp já marca como enviado: quem manda cinquenta
        mensagens não volta para marcar uma a uma, e uma lista de status
        que ninguém mantém não serve para nada;
     6. a biblioteca de planilhas (862 KB) NÃO é baixada ao abrir a aba.

   Uso:
     npx wrangler pages dev public --port 8821
     BASE=http://127.0.0.1:8821 CHROME_PATH=... node teste-painel-reativacao.mjs
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

const LISTA = [
    "Maria Silva\t(19) 97517-2840\t183",
    "MARIA A SILVA\t19975172840\t40",
    "Jose dos Santos\t(11) 3251-4000\t200",
    "Ana Lima\t97517-2841\t150",
    "Lixo\t00000000000\t90"
].join("\n");

const navegador = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);

const contexto = await navegador.newContext();
const pagina = await contexto.newPage();

const erros = [];
const baixados = [];
pagina.on("pageerror", (e) => erros.push(e.message));
pagina.on("request", (r) => baixados.push(r.url()));

await pagina.route("**/farmatech-pedidos-proxy*/**", (rota) => {
    const caminho = new URL(rota.request().url()).pathname;
    const responder = (dados, status = 200) => rota.fulfill({
        status, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(dados)
    });
    if (caminho === "/sessao") {
        return responder({ dono: false, loja: { slug: "mais-barato", nome: "Mais Barato", temSenhaPropria: true } });
    }
    if (caminho === "/fila") return responder({ pedidos: [], abertos: ["novo"] });
    if (caminho === "/banners/todos") return responder({ banners: [], podeEnviarArquivo: false });
    if (caminho === "/promocoes/todas") return responder({ promocoes: [], lotes: [] });
    if (caminho === "/encartes") return responder({ encartes: [], podeEnviarArquivo: false });
    if (caminho.startsWith("/catalogo")) return responder({ pendente: false });
    return responder({ erro: "não encontrada" }, 404);
});

await pagina.goto(BASE + "/painel", { waitUntil: "domcontentloaded" });
await pagina.fill("#senha", "qualquer");
await pagina.click("#btnEntrar");
await pagina.waitForSelector("#conteudo:not([style*='display: none'])", { timeout: 20000 });
await pagina.waitForTimeout(600);

/* ---- 1. a aba está no painel ---------------------------------------- */
console.log("\n1. a aba mora no painel, não dentro do padronizador");
{
    const abas = await pagina.$$eval("#abas button", (bs) => bs.map((b) => b.textContent.trim()));
    conferir("existe uma aba Reativação",
        abas.some((a) => /Reativa/i.test(a)), abas.join(" | "));

    await pagina.click('[data-aba="reativacao"]');
    await pagina.waitForTimeout(400);
    conferir("e ela abre", await pagina.isVisible("#abaReativacao"));
}

/* ---- 2. nada de 862 KB sem pedir ------------------------------------- */
console.log("\n2. o leitor de planilhas só entra sob demanda");
conferir("abrir a aba não baixa o xlsx",
    !baixados.some((u) => /xlsx/i.test(u)),
    baixados.filter((u) => /xlsx/i.test(u)).join(" | "));

/* ---- 3. a lista ------------------------------------------------------ */
console.log("\n3. a lista processada");
{
    await pagina.fill("#reaColado", LISTA);
    await pagina.click("#reaProcessar");
    await pagina.waitForSelector("#reaLista table tbody tr", { timeout: 10000 });

    const linhas = await pagina.$$eval("#reaLista tbody tr",
        (trs) => trs.map((tr) => tr.textContent.replace(/\s+/g, " ")));

    conferir("cinco linhas coladas viraram quatro pessoas",
        linhas.length === 4, `${linhas.length} linhas`);

    const aviso = await pagina.textContent("#reaAviso");
    conferir("e a tela conta que uniu", /repetida/i.test(aviso), aviso.trim());

    const diasMaria = await pagina.$eval(
        "#reaLista tbody tr:has-text('Maria') td.num-col",
        (td) => td.textContent.trim());
    conferir("a Maria vale pela compra mais recente, não pela mais antiga",
        diasMaria === "40", diasMaria);
}

/* ---- 4. o fixo ------------------------------------------------------- */
console.log("\n4. telefone fixo não vira celular de estranho");
{
    const fixo = await pagina.$$eval("#reaLista tbody tr", (trs) =>
        trs.map((tr) => ({
            texto: tr.textContent.replace(/\s+/g, " "),
            temWhats: !!tr.querySelector(".rea-whats")
        })).find((l) => /Jose/i.test(l.texto)));

    conferir("é marcado como fixo", /fixo/i.test(fixo.texto), fixo.texto.slice(0, 80));
    conferir("e NÃO ganha botão de WhatsApp", !fixo.temWhats);
}

/* ---- 5. abrir marca como enviado -------------------------------------- */
console.log("\n5. abrir o WhatsApp marca como enviado");
{
    const antes = await pagina.$eval(
        "#reaLista tbody tr:has-text('Ana') .rea-contato", (s) => s.value).catch(() => null);

    /* A Ana está sem DDD, então não tem botão. Usa a Maria, que está
       pronta. */
    const selAntes = await pagina.$eval(
        "#reaLista tbody tr:has-text('Maria') .rea-contato", (s) => s.value);
    conferir("começa como não enviado", selAntes === "Não enviado", `${selAntes} (Ana: ${antes})`);

    /* O link abre em aba nova; o teste intercepta para o navegador não
       tentar ir ao WhatsApp de verdade. */
    await pagina.route(/wa\.me/, (r) => r.fulfill({ status: 200, body: "ok" }));
    await pagina.click("#reaLista tbody tr:has-text('Maria') .rea-whats");
    await pagina.waitForTimeout(700);

    const selDepois = await pagina.$eval(
        "#reaLista tbody tr:has-text('Maria') .rea-contato", (s) => s.value);
    conferir("e vira 'Enviado' sozinho", selDepois === "Enviado", selDepois);
}

/* ---- 6. não perturbe --------------------------------------------------- */
console.log("\n6. não perturbe vale para as próximas campanhas");
{
    const antes = await pagina.$$eval("#reaLista tbody tr", (t) => t.length);

    await pagina.click("#reaLista tbody tr:has-text('Maria') [data-rea-parar]");
    await pagina.waitForTimeout(500);

    const depois = await pagina.$$eval("#reaLista tbody tr", (t) => t.length);
    conferir("sai da lista na hora", depois === antes - 1, `${antes} → ${depois}`);

    /* A prova que importa: reimportar a MESMA lista não a traz de volta. */
    await pagina.fill("#reaColado", LISTA);
    await pagina.click("#reaProcessar");
    await pagina.waitForTimeout(600);

    const nomes = await pagina.$$eval("#reaLista tbody tr", (trs) => trs.map((t) => t.textContent));
    conferir("e não volta ao reimportar a mesma planilha",
        !nomes.some((n) => /Maria/i.test(n)), nomes.join(" | ").slice(0, 100));

    const aviso = await pagina.textContent("#reaAviso");
    conferir("a tela avisa quantos foram poupados",
        /não perturbe/i.test(aviso), aviso.trim());
}

/* ---- 7. o console ------------------------------------------------------ */
console.log("\n7. nenhum erro de página");
conferir("console limpo", erros.length === 0, erros.join(" | "));

await navegador.close();
console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

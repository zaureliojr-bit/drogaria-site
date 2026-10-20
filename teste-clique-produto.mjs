/* Clicar num produto abre a página dele — inclusive no domínio da
   farmácia.

   O defeito que este teste existe para impedir de voltar: todo card do
   site aponta para /loja/<slug>/produto/<nome>-<ean>. No domínio da
   farmácia, a regra que impedia servir a vitrine de uma CONCORRENTE
   olhava só o começo do caminho — e engolia o link da própria loja.
   Clicar num produto voltava para a home, sem erro nenhum, só um
   redirecionamento.

   Os testes de subdomínio batiam por HTTP e não pegaram: o sintoma é
   um clique.

   O navegador resolve o nome para o servidor local com
   --host-resolver-rules, que é o jeito de o Host chegar de verdade —
   o fetch e os cabeçalhos do Playwright não mandam Host.

   Uso:
     npx wrangler pages dev public --port 8821 --binding DOMINIO_PLATAFORMA=teste.local
     node stub-porteiro.mjs
     BASE=http://127.0.0.1:8821 CHROME_PATH=... node teste-clique-produto.mjs
*/

import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:8821";
const PORTA = new URL(BASE).port || "80";

let falhas = 0;
function conferir(descricao, condicao, detalhe = "") {
    if (condicao) console.log(`  ok   ${descricao}`);
    else {
        console.log(`  FALHA ${descricao}${detalhe ? "  → " + detalhe : ""}`);
        falhas++;
    }
}

const CATALOGO = {
    produtos: [{
        codigo: "1", ean: "7891106000888",
        descricao: "Dipirona 500mg C/10", precoVenda: "9.90", categoria: "GENERICO"
    }]
};

const navegador = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    args: [
        "--host-resolver-rules=MAP mais-barato.teste.local 127.0.0.1," +
        "MAP teste.local 127.0.0.1"
    ]
});

async function abrir(host) {

    const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 } });
    const pagina = await contexto.newPage();

    await pagina.route(/produtos.*\.json|raw\.githubusercontent/, (r) => r.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(CATALOGO)
    }));

    await pagina.goto(`http://${host}:${PORTA}/`, { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(3000);

    return { pagina, contexto };
}

/* ---- 1. no domínio da farmácia --------------------------------------- */
console.log("\n1. clicando num produto no domínio da farmácia");
{
    const { pagina, contexto } = await abrir("mais-barato.teste.local");

    const href = await pagina.getAttribute(".produto-nome-link", "href");

    /* Sem o /loja/<slug> no meio: no domínio dela o endereço é curto, e
       assim o clique não gasta uma ida e volta no 301. */
    conferir("o card aponta para o endereço curto",
        href === "/produto/dipirona-500mg-c-10-7891106000888", href);

    await pagina.click(".produto-nome-link");
    await pagina.waitForTimeout(3000);

    const endereco = pagina.url();
    const titulo = await pagina.title();

    conferir("o clique NÃO volta para a home",
        !/\/$/.test(new URL(endereco).pathname), endereco);
    conferir("e abre a página do produto",
        /\/produto\//.test(endereco), endereco);
    conferir("com o produto no título",
        /Dipirona/i.test(titulo), titulo);
    conferir("e no domínio dela, não no da plataforma",
        new URL(endereco).hostname === "mais-barato.teste.local", endereco);

    await contexto.close();
}

/* ---- 2. o endereço antigo continua funcionando ------------------------ */
console.log("\n2. link antigo, compartilhado antes da mudança");
{
    const { pagina, contexto } = await abrir("mais-barato.teste.local");

    /* Quem mandou o link no WhatsApp mês passado mandou no formato da
       plataforma. Ele tem de continuar chegando na página certa. */
    await pagina.goto(
        `http://mais-barato.teste.local:${PORTA}/loja/mais-barato/produto/dipirona-7891106000888`,
        { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(2500);

    conferir("chega na página do produto, e não na home",
        /\/produto\/dipirona-7891106000888$/.test(new URL(pagina.url()).pathname),
        pagina.url());

    await contexto.close();
}

/* ---- 3. a plataforma não mudou ---------------------------------------- */
console.log("\n3. na plataforma, nada mudou");
{
    const { pagina, contexto } = await abrir("teste.local");

    const href = await pagina.getAttribute(".produto-nome-link", "href");
    conferir("o card continua apontando com /loja/<slug>",
        href === "/loja/mais-barato/produto/dipirona-500mg-c-10-7891106000888", href);

    await pagina.click(".produto-nome-link");
    await pagina.waitForTimeout(3000);

    conferir("e o clique abre a página do produto",
        /\/loja\/mais-barato\/produto\//.test(pagina.url()), pagina.url());
    conferir("com o produto no título", /Dipirona/i.test(await pagina.title()));

    await contexto.close();
}

await navegador.close();
console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

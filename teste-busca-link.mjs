/* A busca tem endereço, e dá para mandar a lista.

   O pedido que originou isto: o cliente pergunta no WhatsApp "tem
   ibuprofeno?", e a atendente quer mandar a lista com os preços em vez
   de pedir que ele procure sozinho na home.

   O que havia antes: ?busca=ibuprofeno FUNCIONAVA ao abrir, mas o
   código apagava o parâmetro da barra logo depois — e buscar na caixa
   nunca escrevia nada ali. O link existia e não havia como copiá-lo.

   Uso:
     BASE=http://127.0.0.1:8821 CHROME_PATH=... node teste-busca-link.mjs
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
        { codigo: "1", ean: "7891000000001", descricao: "Ibuprofeno 400mg C/20",
          precoVenda: "12.90", categoria: "GENERICO" },
        { codigo: "2", ean: "7891000000002", descricao: "Ibuprofeno 600mg C/20",
          precoVenda: "18.90", categoria: "GENERICO" },
        { codigo: "3", ean: "7891000000003", descricao: "Dipirona 500mg C/10",
          precoVenda: "9.90", categoria: "GENERICO" }
    ]
};

const navegador = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);

async function abrir(caminho = "/") {
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

/* ---- 1. buscar escreve o endereço ------------------------------------ */
console.log("\n1. buscar na caixa escreve o endereço");
{
    const { pagina, contexto } = await abrir();

    conferir("a home começa sem parâmetro", !location0(await pagina.url()));

    await pagina.fill("#busca", "ibuprofeno");
    await pagina.click(".btn-buscar");
    await pagina.waitForTimeout(1200);

    const url = new URL(pagina.url());
    conferir("o endereço passa a ter o termo",
        url.searchParams.get("busca") === "ibuprofeno", pagina.url());

    const cards = await pagina.$$eval(".card", (c) => c.length);
    conferir("e a lista é só de ibuprofeno", cards === 2, `${cards} cards`);

    await contexto.close();
}

/* ---- 2. o link funciona de verdade ----------------------------------- */
console.log("\n2. abrir o link já cai na lista");
{
    const { pagina, contexto } = await abrir("/?busca=ibuprofeno");

    const titulo = await pagina.textContent("#resultadoTitulo");
    conferir("abre já filtrado", /ibuprofeno/i.test(titulo || ""), titulo);

    const cards = await pagina.$$eval(".card", (c) => c.length);
    conferir("com os dois produtos", cards === 2, `${cards} cards`);

    /* O defeito antigo: o parâmetro era apagado logo depois de abrir,
       então quem recebeu o link não conseguia repassá-lo. */
    conferir("e o endereço NÃO é apagado da barra",
        new URL(pagina.url()).searchParams.get("busca") === "ibuprofeno",
        pagina.url());

    await contexto.close();
}

/* ---- 3. limpar a busca limpa o endereço ------------------------------- */
console.log("\n3. limpar a busca limpa o endereço");
{
    const { pagina, contexto } = await abrir("/?busca=ibuprofeno");

    await pagina.fill("#busca", "");
    await pagina.click(".btn-buscar");
    await pagina.waitForTimeout(1200);

    conferir("o parâmetro some",
        !new URL(pagina.url()).searchParams.has("busca"), pagina.url());

    await contexto.close();
}

/* ---- 4. a barra de endereço é o que a loja copia ---------------------- */
console.log("\n4. o endereço fica pronto para copiar da barra");
{
    const { pagina, contexto } = await abrir();

    await pagina.fill("#busca", "ibuprofeno");
    await pagina.click(".btn-buscar");
    await pagina.waitForTimeout(1200);

    /* Não há botão de compartilhar: quem olha esta tela é o CLIENTE, e
       um botão de ferramenta da loja no meio dos produtos é ruído para
       ele. A atendente copia da barra de endereço, que agora carrega a
       busca. */
    const endereco = pagina.url();

    conferir("o endereço completo serve para colar no WhatsApp",
        /^https?:\/\/[^/]+\/\?busca=ibuprofeno$/.test(endereco), endereco);

    conferir("e a tela não ganhou botão de ferramenta da loja",
        (await pagina.$("#compartilharBusca")) === null);

    await contexto.close();
}

/* ---- 5. sair da busca também limpa o endereço ------------------------ */
console.log("\n5. voltar para a vitrine não deixa a busca na barra");
{
    /* O defeito, visto na loja: buscar "Goodvit", voltar para a vitrine
       e a barra continuar dizendo ?busca=Goodvit com os destaques da
       semana na tela. É esse endereço que a atendente copia para o
       WhatsApp — o cliente abriria uma página diferente da que ela
       estava vendo. E um F5 traria de volta a busca que ela já tinha
       deixado. */
    const { pagina, contexto } = await abrir("/?busca=ibuprofeno");

    conferir("a busca está na barra",
        new URL(pagina.url()).searchParams.get("busca") === "ibuprofeno", pagina.url());

    await pagina.click('[data-acao="voltar-vitrine"]');
    await pagina.waitForTimeout(900);

    conferir("voltando para a vitrine, o parâmetro some",
        !new URL(pagina.url()).searchParams.has("busca"), pagina.url());

    /* A prova de que a barra e a tela passaram a dizer a mesma coisa:
       recarregar o endereço devolve a MESMA tela, e não a busca. */
    await pagina.reload({ waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(2500);

    const campo = await pagina.inputValue("#busca");
    conferir("e recarregar não ressuscita a busca", campo === "", campo);

    await contexto.close();
}

/* ---- 6. as outras portas de saída da busca --------------------------- */
console.log("\n6. categoria e ofertas idem");
{
    const { pagina, contexto } = await abrir("/?busca=ibuprofeno");

    await pagina.click('#filtros [data-acao="filtrar"]');
    await pagina.waitForTimeout(900);

    conferir("entrar numa categoria tira a busca da barra",
        !new URL(pagina.url()).searchParams.has("busca"), pagina.url());

    await contexto.close();
}

{
    const { pagina, contexto } = await abrir("/?busca=ibuprofeno");

    /* Chamado direto, e não pelo chip: o chip "Ofertas" só aparece
       quando o catálogo tem alguma, e este catálogo de teste é o que as
       outras provas deste arquivo contam card por card. A função é a
       mesma que o chip chama. */
    await pagina.evaluate(() => verOfertas());
    await pagina.waitForTimeout(900);

    conferir("abrir as ofertas também",
        !new URL(pagina.url()).searchParams.has("busca"), pagina.url());

    await contexto.close();
}

function location0(u) { return new URL(u).searchParams.has("busca"); }

await navegador.close();
console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

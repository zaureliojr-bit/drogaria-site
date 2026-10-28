/* As políticas são de UMA farmácia — e tem de ser a certa.

   A privacidade, os termos e a troca ficam numa página só, servida
   igual para todas as lojas, e o HTML dela traz os dados da farmácia
   principal porque é o arquivo da raiz. É exatamente o arranjo que já
   deu errado no rodapé: a filial sem autorização sanitária cadastrada
   publicava, no site dela, o número de processo e a licença MS da
   OUTRA farmácia.

   No rodapé isso é grave. Numa política de privacidade é pior: o
   documento diz quem é o controlador dos dados do cliente, e publicar
   ali o CNPJ de outro estabelecimento é dizer que os dados são de quem
   não os recebeu. O cliente que quiser exercer um direito do art. 18
   da LGPD cobra da empresa errada.

   Este teste confere, na tela, que a página de políticas aberta no
   contexto de uma filial mostra os dados DELA — e nenhum resquício dos
   da principal.

   Uso:
     npx wrangler pages dev public --port 8821
     BASE=http://127.0.0.1:8821 CHROME_PATH=... node teste-politicas.mjs
*/

import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://127.0.0.1:8821";

let falhas = 0;
function conferir(descricao, condicao, detalhe = "") {
    if (condicao) console.log(`  ok   ${descricao}`);
    else {
        console.log(`  FALHA ${descricao}${detalhe ? "  → " + detalhe : ""}`);
        falhas++;
    }
}

/* ---- 1. os dois endereços do worker não podem divergir -------------- */
/* A página de políticas não carrega o script.js — seria baixar 2,6 MB
   de catálogo para ler um texto —, então o loja.js guarda uma cópia do
   endereço do worker para esse caso. Cópia que ninguém compara apodrece:
   no dia em que o worker mudar de endereço, a vitrine acompanha e a
   política silenciosamente volta a mostrar os dados do HTML, que são os
   da farmácia principal. Falhar aqui é mais barato. */
console.log("\n1. o endereço do worker, nos dois lugares");
{
    const script = readFileSync("public/script.js", "utf8");
    const loja = readFileSync("public/loja.js", "utf8");

    const naVitrine = script.match(/const API_PEDIDOS_D1 = "([^"]*)"/)?.[1];
    const naPolitica = loja.match(/const API_LOJA_SEM_SCRIPT = "([^"]*)"/)?.[1];

    conferir("o script.js declara o worker", Boolean(naVitrine), String(naVitrine));
    conferir("o loja.js tem a cópia para quem não carrega o script.js",
        Boolean(naPolitica), String(naPolitica));
    conferir("e as duas são o MESMO endereço", naVitrine === naPolitica,
        `${naVitrine} ≠ ${naPolitica}`);
}

const navegador = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);

/* A filial: CNPJ diferente, cidade diferente, WhatsApp diferente — e,
   de propósito, SEM autorização sanitária e SEM licença MS, que é o
   estado real de uma loja recém-cadastrada e o que fazia o vazamento. */
const FILIAL = {
    loja: {
        slug: "mb-prudente",
        nome: "Drogaria Mais Barato Prudente",
        cnpj: "31175246000128",
        logradouro: "Avenida Brasil",
        numero: "1200",
        bairro: "Centro",
        cidade: "Presidente Prudente",
        uf: "SP",
        cep: "19010-090",
        whatsapp: "5518999990000",
        farmaceutico: "Dr. João Ribeiro",
        crf: "998877",
        rotulo_responsavel: "Farmacêutico responsável",
        autorizacao: "",
        licenca_ms: "",
        raio_entrega_km: 5,
        fuso: "America/Sao_Paulo"
    },
    horario: [],
    visual: null
};

async function abrirPoliticas(resposta) {
    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 1000 } });
    const pagina = await contexto.newPage();

    const chamadas = [];

    await pagina.addInitScript(() => {
        navigator.sendBeacon = () => false;
        try { localStorage.setItem("loja-atual", "mb-prudente"); } catch { /* nada */ }
    });

    /* Regex, e não glob: o glob de duas estrelas do Playwright apontado
       para /loja deixa de casar quando a URL leva `?loja=` — e o teste
       passaria batendo no worker de produção em vez do dublê. */
    await pagina.route(/farmatech-pedidos-proxy[^/]*\/loja(\?|$)/, (rota) => {
        const url = new URL(rota.request().url());
        chamadas.push({ rota: url.pathname, loja: url.searchParams.get("loja") });
        return rota.fulfill({
            status: 200, contentType: "application/json",
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(resposta)
        });
    });

    await pagina.goto(BASE + "/politicas", { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(1500);

    return { pagina, contexto, chamadas };
}

/* ---- 2. a página pede o cadastro, e pede o da loja certa ------------ */
console.log("\n2. de quem a página pergunta");
{
    const { pagina, contexto, chamadas } = await abrirPoliticas(FILIAL);

    conferir("a página buscou o cadastro da loja", chamadas.length > 0,
        JSON.stringify(chamadas));
    conferir("e carimbou a filial no pedido",
        chamadas.length > 0 && chamadas.every((c) => c.loja === "mb-prudente"),
        JSON.stringify(chamadas));

    const texto = await pagina.innerText("main.pagina-politicas");

    /* O que tem de aparecer: ela. */
    conferir("o nome da filial está no documento",
        texto.includes("Drogaria Mais Barato Prudente"), texto.slice(0, 200));
    conferir("o CNPJ dela, pontuado",
        texto.includes("CNPJ 31.175.246/0001-28"), texto.slice(0, 300));
    conferir("o farmacêutico dela",
        texto.includes("Dr. João Ribeiro") && texto.includes("CRF 998877"));
    conferir("a cidade dela, no foro",
        texto.includes("foro da comarca de Presidente Prudente – SP"));
    conferir("e o raio de entrega dela",
        texto.includes("raio de 5 km"));

    /* O Decreto 7.962/2013 pede o endereço eletrônico de contato em
       destaque, junto do CNPJ e do endereço físico. Sem e-mail
       cadastrado, vale o WhatsApp — que é o canal que a farmácia
       realmente atende. */
    const rodape = await pagina.innerText("footer.rodape");
    conferir("o rodapé traz um canal de contato",
        /fale com a gente/i.test(rodape), rodape.slice(0, 200));

    /* O número é o do FILIAL desta seção (5518999990000), formatado
       para leitura. O da farmácia principal — (11) 92519-0101, escrito
       no HTML como rede — não pode sobrar. */
    conferir("e é o da filial, não o da vizinha",
        /\(18\) 99999-0000/.test(rodape) && !/92519-0101/.test(rodape),
        rodape.slice(0, 300));

    /* O que NÃO pode aparecer: a outra farmácia. Cada um destes é um
       documento de outro estabelecimento publicado como se fosse dela. */
    conferir("o CNPJ da farmácia principal desapareceu",
        !texto.includes("37.925.108"), texto);
    conferir("o processo de autorização dela também",
        !texto.includes("25351.507967"), texto);
    conferir("a licença MS dela também",
        !texto.includes("7.89888-2"), texto);
    conferir("e o nome da farmacêutica dela também",
        !texto.includes("Laís Carvalho"), texto);

    /* Sem autorização cadastrada, a linha some em vez de ficar em
       branco — e some mesmo, não fica escondida com o texto antigo
       dentro, que é o que o `hidden` garante e um `display:none` por
       CSS não garantiria. */
    const autorizacao = await pagina.$eval('.politicas-quem [data-loja="autorizacao"]',
        (el) => ({ escondido: el.hidden, texto: el.textContent }));
    conferir("a linha da autorização está escondida",
        autorizacao.escondido === true, JSON.stringify(autorizacao));
    conferir("e vazia", autorizacao.texto === "", JSON.stringify(autorizacao));

    /* Os dois links de WhatsApp da página (dados pessoais e troca) têm
       de levar ao número DELA: um cliente pedindo a exclusão dos dados
       dele na conversa de outra farmácia é incidente, não atendimento. */
    const numeros = await pagina.$$eval('.pagina-politicas a[data-loja="whatsapp"]',
        (as) => as.map((a) => new URL(a.href).pathname));
    conferir("há dois links de WhatsApp na página", numeros.length === 2,
        JSON.stringify(numeros));
    conferir("e os dois são o da filial",
        numeros.length > 0 && numeros.every((n) => n === "/5518999990000"),
        JSON.stringify(numeros));

    await contexto.close();
}

/* ---- 3. quando o worker não responde -------------------------------- */
console.log("\n3. sem resposta do worker, o texto continua de pé");
{
    const contexto = await navegador.newContext();
    const pagina = await contexto.newPage();
    await pagina.route(/farmatech-pedidos-proxy/, (r) => r.abort());
    await pagina.goto(BASE + "/politicas", { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(1200);

    const texto = await pagina.innerText("main.pagina-politicas");

    /* Aqui os dados são os do HTML — os da farmácia principal — e está
       certo que seja: é a raiz da plataforma, e um documento sem
       identificação nenhuma seria pior que um com a da loja padrão. O
       que não pode é o TEXTO desaparecer. */
    conferir("as três seções continuam na tela",
        texto.includes("Política de privacidade")
        && texto.includes("Termos de uso")
        && texto.includes("Trocas e devoluções"), texto.slice(0, 120));
    conferir("e o aviso da Portaria 344 sobre venda online",
        texto.includes("Portaria nº 344/1998"));

    await contexto.close();
}

/* ---- 3b. o site não contradiz a própria política -------------------- */
console.log("\n3b. o carrinho e a política contam a mesma história");
{
    const contexto = await navegador.newContext();
    const pagina = await contexto.newPage();
    await pagina.addInitScript(() => { navigator.sendBeacon = () => false; });
    await pagina.route(/farmatech-pedidos-proxy|raw\.githubusercontent|produtos.*\.json/,
        (r) => r.abort());

    await pagina.goto(BASE + "/carrinho", { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(1200);

    const aviso = (await pagina.textContent(".aviso-privacidade") || "")
        .replace(/\s+/g, " ");

    /* Dizia "Não compartilhamos com terceiros" — ao lado do botão de
       finalizar, no momento exato da coleta — enquanto a política da
       mesma loja lista cinco. Texto falso no aviso de privacidade é
       pior que aviso nenhum: é a prova de que a loja disse o contrário
       do que faz. */
    conferir("o carrinho não promete o que a política desmente",
        !/não compartilhamos com terceiros/i.test(aviso), aviso);

    conferir("e leva à política de privacidade",
        await pagina.locator('.aviso-privacidade a[href*="politicas"]').count() > 0,
        aviso);

    await contexto.close();
}

/* ---- 4. as âncoras existem, e o rodapé leva a elas ------------------ */
console.log("\n4. os links do rodapé chegam a algum lugar");
{
    const contexto = await navegador.newContext();
    const pagina = await contexto.newPage();
    await pagina.route(/farmatech-pedidos-proxy|raw\.githubusercontent|produtos.*\.json/,
        (r) => r.abort());

    await pagina.goto(BASE + "/politicas", { waitUntil: "domcontentloaded" });

    for (const ancora of ["privacidade", "termos", "trocas"]) {
        const existe = await pagina.$(`#${ancora}`);
        conferir(`a seção #${ancora} existe`, Boolean(existe));
    }

    /* Rodapé de todas as páginas de venda: link quebrado em política é
       o tipo de coisa que ninguém clica até o Procon clicar. */
    for (const pagina_ of ["/", "/carrinho", "/encarte", "/oferta"]) {
        await pagina.goto(BASE + pagina_, { waitUntil: "domcontentloaded" });
        const links = await pagina.$$eval(".rodape-politicas a",
            (as) => as.map((a) => new URL(a.href).pathname + new URL(a.href).hash));
        conferir(`${pagina_} tem os três links de política`,
            links.length === 3
            && links.includes("/politicas#privacidade")
            && links.includes("/politicas#termos")
            && links.includes("/politicas#trocas"),
            JSON.stringify(links));
    }

    await contexto.close();
}

await navegador.close();

console.log(falhas ? `\n${falhas} falha(s).\n` : "\nTudo certo.\n");
process.exit(falhas ? 1 : 0);

/* Fase 2 vista do navegador: a loja virou dado, e o site lê dela.

   A promessa da Fase 2 é "nada muda para o cliente". Promessa dessas só
   vale verificada, então a seção 2 compara o rodapé letra por letra
   antes e depois de a API responder: um espaço a mais no endereço
   montado em JavaScript apareceria para 100% dos visitantes.

   E a seção 3 é a que prova que a fase serviu para alguma coisa: com uma
   SEGUNDA loja na resposta, o rodapé, o link de WhatsApp, as
   coordenadas e o horário têm de mudar sozinhos, sem tocar em HTML.
   Enquanto isso não passar, a plataforma multiloja é só uma tabela.

   A API é interceptada pelo navegador (page.route), não chamada de
   verdade: dá para rodar isto antes de publicar o worker, e dá para
   testar a segunda loja sem cadastrar segunda loja.

   Uso:
     npx wrangler pages dev public --port 8801 &
     BASE=http://127.0.0.1:8801 node teste-loja-no-site.mjs
*/

import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://127.0.0.1:8801";

/* A cor padrão da plataforma, lida das folhas de estilo em vez de
   escrita aqui.

   Escrita, ela transformava este teste num alarme de mudança de marca:
   o refinamento visual trocou o azul da plataforma e o teste acusou
   falha, embora nada do que ele existe para vigiar tivesse quebrado.
   O que importa é outra coisa — que a farmácia SEM cor própria fique
   com a cor da casa, e não com a da farmácia que o visitante abriu
   antes. Lendo o valor da folha, o teste continua pegando isso e para
   de reclamar de decisão de design.

   A última declaração vence, como no navegador: a camada premium vem
   depois do style.css e é ela que manda. */
const CORES = ["public/style.css", "public/visual-premium.css"]
    .flatMap((arquivo) => [...readFileSync(arquivo, "utf8")
        .matchAll(/--marca:\s*(#[0-9a-f]{3,8})/gi)].map((m) => m[1]));

const COR_PADRAO = (CORES[CORES.length - 1] || "").toLowerCase();

/* O que o worker devolve hoje, com a tabela recém-criada. Os valores são
   os do schema-lojas.sql — se divergirem, é sinal de que o seed e o site
   já não contam a mesma história. */
const LOJA_REAL = {
    loja: {
        slug: "mais-barato",
        nome: "Drogaria Mais Barato",
        cnpj: "37.925.108/0001-03",
        logradouro: "Rua Almeida Leme",
        numero: "07",
        complemento: "Loja 1",
        bairro: "Parque São Bernardo",
        cidade: "São Bernardo do Campo",
        uf: "SP",
        cep: "09761-170",
        latitude: -23.709245,
        longitude: -46.5251954,
        whatsapp: "5511925190101",
        farmaceutico: "Dra. Laís Carvalho da Silva",
        crf: "122886",
        rotulo_responsavel: "Farmacêutica responsável",
        autorizacao: "Processo 25351.507967/2022-82",
        licenca_ms: "MS 7.89888-2",
        raio_entrega_km: 8,
        frete_gratis_acima: 0,
        fuso: "America/Sao_Paulo"
    },
    horario: [
        { dia: 0, abre: "08:00", fecha: "19:30" },
        { dia: 1, abre: "07:00", fecha: "21:30" },
        { dia: 2, abre: "07:00", fecha: "21:30" },
        { dia: 3, abre: "07:00", fecha: "21:30" },
        { dia: 4, abre: "07:00", fecha: "21:30" },
        { dia: 5, abre: "07:00", fecha: "21:30" },
        { dia: 6, abre: "07:00", fecha: "21:30" }
    ]
};

/* Uma farmácia inventada, de outra cidade e de outro fuso, aberta 24h.
   Tudo diferente de propósito: valor que não muda na tela é valor que
   continua vindo do HTML. */
const LOJA_SEGUNDA = {
    loja: {
        slug: "farma-centro",
        nome: "Farmácia do Centro",
        cnpj: "11.222.333/0001-44",
        logradouro: "Avenida Getúlio Vargas",
        numero: "1500",
        complemento: "",
        bairro: "Centro",
        cidade: "Cuiabá",
        uf: "MT",
        cep: "78005-370",
        latitude: -15.601411,
        longitude: -56.097892,
        whatsapp: "5565999887766",
        farmaceutico: "Dr. João Pereira",
        crf: "998877",
        rotulo_responsavel: "Farmacêutico responsável",
        autorizacao: "Processo 00000.000000/2024-11",
        licenca_ms: "MS 1.23456-7",
        raio_entrega_km: 12,
        frete_gratis_acima: 150,
        fuso: "America/Cuiaba"
    },
    horario: [0, 1, 2, 3, 4, 5, 6].map((dia) => ({ dia, abre: "00:00", fecha: "23:59" })),
    /* A marca dela: logotipo e cor próprios. O layout é o mesmo de todas
       — é o produto —, mas a marca é o que o cliente dela reconhece. */
    visual: { logo: "https://exemplo.test/logo-da-outra.png", cor: "#0a7d4b" }
};

let falhas = 0;
function conferir(descricao, condicao, detalhe = "") {
    if (condicao) console.log(`  ok   ${descricao}`);
    else {
        console.log(`  FALHA ${descricao}${detalhe ? "  → " + detalhe : ""}`);
        falhas++;
    }
}

const navegador = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);
const contexto = await navegador.newContext();

/* resposta: um objeto para a API devolver, ou null para a API falhar. */
async function abrir(caminho, resposta) {
    const pagina = await contexto.newPage();

    /* Expressão regular, e nao o glob exato: a chamada passou a levar a
       farmacia no endereco (?loja=mb-prudente), e o glob deixava de
       casar — o teste ia a rede e lia a loja de producao. */
    await pagina.route(/\/loja(\?|$)/, async (rota) => {
        if (resposta === null) return rota.abort("failed");
        await rota.fulfill({
            status: 200,
            contentType: "application/json",
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(resposta)
        });
    });

    await pagina.goto(BASE + caminho, { waitUntil: "domcontentloaded" });
    return pagina;
}

const lerRodape = (pagina) => pagina.evaluate(() => ({
    identificacao: document.querySelector('[data-loja="identificacao"]')?.textContent.trim(),
    endereco: document.querySelector('[data-loja="endereco"]')?.textContent.trim(),
    responsavel: document.querySelector('[data-loja="responsavel"]')?.textContent.trim(),
    autorizacao: document.querySelector('[data-loja="autorizacao"]')?.textContent.trim(),
    whatsapp: document.querySelector('a[data-loja="whatsapp"]')?.getAttribute("href")
}));

/* ---- 1. o HTML sozinho, sem API ------------------------------------- */
console.log("\n1. API fora do ar: a página não perde nada");
let doHtml;
{
    const pagina = await abrir("/", null);
    doHtml = await lerRodape(pagina);

    conferir("o CNPJ está no rodapé", /37\.925\.108\/0001-03/.test(doHtml.identificacao || ""), doHtml.identificacao);
    conferir("o endereço está no rodapé", /Almeida Leme/.test(doHtml.endereco || ""), doHtml.endereco);
    conferir("o CRF está no rodapé", /122886/.test(doHtml.responsavel || ""), doHtml.responsavel);
    conferir("o WhatsApp da loja continua apontando para ela",
        (doHtml.whatsapp || "").includes("5511925190101"), doHtml.whatsapp);

    /* O indicador tem de dizer alguma coisa mesmo sem cadastro. */
    const status = await pagina.textContent("#status");
    conferir("o indicador diz Aberto ou Fechado", /Aberto|Fechado/.test(status || ""), status);

    const erros = await pagina.evaluate(() => window.__errosDeConsole || null);
    conferir("a falha da API não vira erro na tela", erros === null);

    await pagina.close();
}

/* ---- 2. a loja de verdade: nada pode mudar -------------------------- */
console.log("\n2. API respondendo a loja de hoje: o rodapé não se mexe");
{
    const pagina = await abrir("/", LOJA_REAL);
    await pagina.waitForFunction(() => !!window.__lojaPronta, null, { polling: 300, timeout: 15000 })
        .catch(() => {});
    /* waitForFunction usa eval e o CSP barra. Espera pelo efeito. */
    await pagina.waitForTimeout(2500);

    const depois = await lerRodape(pagina);

    for (const campo of ["identificacao", "endereco", "responsavel", "autorizacao"]) {
        conferir(`${campo}: idêntico ao que o HTML já trazia`,
            doHtml[campo] === depois[campo],
            `HTML="${doHtml[campo]}" API="${depois[campo]}"`);
    }
    conferir("o link de WhatsApp não mudou", doHtml.whatsapp === depois.whatsapp,
        `${doHtml.whatsapp} → ${depois.whatsapp}`);

    await pagina.close();
}

/* ---- 3. a segunda loja: tudo muda sozinho --------------------------- */
console.log("\n3. API respondendo OUTRA farmácia: a tela acompanha");
{
    const pagina = await abrir("/", LOJA_SEGUNDA);
    await pagina.waitForTimeout(2500);

    const outra = await lerRodape(pagina);

    conferir("nome e CNPJ trocaram",
        outra.identificacao === "Farmácia do Centro · CNPJ 11.222.333/0001-44", outra.identificacao);
    conferir("endereço trocou, e sem complemento não sobra traço solto",
        outra.endereco === "Avenida Getúlio Vargas 1500, Centro, Cuiabá – MT, CEP 78005-370",
        outra.endereco);
    /* O rótulo também troca: a loja diz como o responsável dela se
       identifica, em vez de o site deduzir do nome. */
    conferir("responsável, CRF e rótulo trocaram",
        outra.responsavel === "Farmacêutico responsável: Dr. João Pereira – CRF 998877", outra.responsavel);
    conferir("autorização trocou",
        outra.autorizacao === "Autorização: Processo 00000.000000/2024-11 · MS 1.23456-7", outra.autorizacao);
    conferir("o WhatsApp aponta para a outra farmácia",
        (outra.whatsapp || "").includes("5565999887766"), outra.whatsapp);
    conferir("e a mensagem pronta do botão foi preservada",
        /text=/.test(outra.whatsapp || ""), outra.whatsapp);

    /* As constantes que o cálculo de frete usa. São o caso mais perigoso:
       erradas, o site aceita entregar onde a farmácia não entrega. */
    const constantes = await pagina.evaluate(() => ({
        whats: typeof WHATS_LOJA !== "undefined" ? WHATS_LOJA : null,
        lat: typeof LOJA_LAT !== "undefined" ? LOJA_LAT : null,
        lng: typeof LOJA_LNG !== "undefined" ? LOJA_LNG : null,
        raio: typeof RAIO_MAX_KM !== "undefined" ? RAIO_MAX_KM : null,
        freteGratis: typeof FRETE_GRATIS_ACIMA_DE !== "undefined" ? FRETE_GRATIS_ACIMA_DE : null
    }));
    conferir("WHATS_LOJA trocou", constantes.whats === "5565999887766", String(constantes.whats));
    conferir("as coordenadas trocaram",
        Math.abs(constantes.lat - -15.601411) < 1e-6 && Math.abs(constantes.lng - -56.097892) < 1e-6,
        `${constantes.lat}, ${constantes.lng}`);
    conferir("o raio de entrega trocou", constantes.raio === 12, String(constantes.raio));
    conferir("o frete grátis trocou", constantes.freteGratis === 150, String(constantes.freteGratis));

    /* Aberta 24h: o indicador tem de dizer Aberto a qualquer hora que
       este teste rode, inclusive de madrugada. */
    const status = await pagina.textContent("#status");
    conferir("loja aberta 24h aparece como Aberta", /Aberto/.test(status || ""), status);

    await pagina.close();
}

/* ---- 4. horário fechado --------------------------------------------- */
console.log("\n4. loja fechada: o indicador acompanha o cadastro");
{
    const fechada = {
        loja: { ...LOJA_SEGUNDA.loja, slug: "fechada" },
        /* Uma faixa de um minuto, à meia-noite: em qualquer hora normal
           de rodar o teste, a loja está fechada. */
        horario: [0, 1, 2, 3, 4, 5, 6].map((dia) => ({ dia, abre: "00:00", fecha: "00:01" }))
    };
    const pagina = await abrir("/", fechada);
    await pagina.waitForTimeout(2500);

    const status = await pagina.textContent("#status");
    const agoraLa = await pagina.evaluate(() =>
        new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Cuiaba", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
            .format(new Date()));

    if (agoraLa === "00:00") {
        console.log("  (pulado — são 00:00 em Cuiabá, a loja está dentro da faixa)");
    } else {
        conferir("mostra Fechado", /Fechado/.test(status || ""), `${status} (lá são ${agoraLa})`);
    }

    await pagina.close();
}

/* ---- 5. a página de oferta usa o mesmo horário ---------------------- */
console.log("\n5. a landing de ofertas lê o mesmo cadastro");
{
    const pagina = await abrir("/oferta", LOJA_SEGUNDA);
    await pagina.waitForTimeout(3000);

    const selo = await pagina.textContent("#lpStatus").catch(() => "");
    const linha = await pagina.textContent("#lpHorario").catch(() => "");

    conferir("o selo diz aberto, porque a loja do cadastro é 24h",
        /Aberto agora/.test(selo || ""), selo);
    conferir("e a frase do horário não fala em fechado", !/Fechado/.test(linha || ""), linha);

    await pagina.close();
}

/* ---- 6. a marca de cada farmácia ------------------------------------ */
console.log("\n6. logotipo e cor da filial");
{
    const pagina = await abrir("/", LOJA_SEGUNDA);
    await pagina.waitForTimeout(2500);

    const logo = await pagina.getAttribute('img[data-loja="logo"]', "src");
    conferir("o logotipo trocou", logo === "https://exemplo.test/logo-da-outra.png", logo);

    /* A cor entra como variável, e tudo que o CSS pinta com ela
       acompanha: cabeçalho, botões, pílulas, faixas. É por isso que a
       cor sai barato e o layout não — o CSS já usa variável em 106
       lugares, e nenhuma cor de marca está escrita à mão. */
    const cores = await pagina.evaluate(() => {
        const raiz = getComputedStyle(document.documentElement);
        return {
            marca: raiz.getPropertyValue("--marca").trim(),
            escura: raiz.getPropertyValue("--marca-escura").trim(),
            clara: raiz.getPropertyValue("--marca-clara").trim(),
            cabecalho: getComputedStyle(document.querySelector("header.header")).backgroundColor
        };
    });
    conferir("a cor da marca trocou", cores.marca.toLowerCase() === "#0a7d4b", cores.marca);
    conferir("as variações foram derivadas dela",
        cores.escura.includes("color-mix") || cores.escura.startsWith("rgb"), cores.escura);

    const tema = await pagina.getAttribute('meta[name="theme-color"]', "content");
    conferir("e a cor da barra do navegador também", (tema || "").toLowerCase() === "#0a7d4b", tema);

    await pagina.close();
}

/* ---- 7. e a farmácia sem marca própria ------------------------------ */
console.log("\n7. quem não mandou logotipo fica com a marca padrão");
{
    const pagina = await abrir("/", LOJA_REAL);   // sem o campo visual
    await pagina.waitForTimeout(2500);

    const logo = await pagina.getAttribute('img[data-loja="logo"]', "src");
    conferir("o logotipo continua o da casa", /logo\.png$/.test(logo || ""), logo);

    const marca = await pagina.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--marca").trim());
    conferir(`e a cor também — a da casa é ${COR_PADRAO}`,
        Boolean(COR_PADRAO) && marca.toLowerCase() === COR_PADRAO, marca);

    await pagina.close();
}

/* ---- campo vazio não herda o da outra farmácia ----------------------- */
console.log("\nA filial sem autorização cadastrada não mostra a da vizinha");
{
    /* O defeito, visto no dia em que a segunda loja entrou no ar: o
       rodapé da filial publicava o número de processo e a licença MS da
       PRIMEIRA farmácia.

       A causa era uma gentileza mal colocada: campo vazio fazia a
       função voltar sem escrever, deixando na tela o que estava no
       HTML — e o HTML traz os dados da primeira loja, porque é dela o
       arquivo servido na raiz. Documento sanitário de um
       estabelecimento, no site de outro. */
    const pagina = await abrir("/", {
        loja: {
            slug: "mb-prudente",
            nome: "Drogaria Mais Barato-Prudente",
            cnpj: "31175246000128",
            logradouro: "Rua Prudente de Morais", numero: "19",
            complemento: "Loja", bairro: "Casa Grande",
            cidade: "Diadema", uf: "SP", cep: "09960-500",
            whatsapp: "11999990000",
            farmaceutico: "Dra Maria Tereza Olivera Dias Farina",
            crf: "127136",
            rotulo_responsavel: "Farmacêutica responsável",
            /* Os dois campos que a filial não tem cadastrados. */
            autorizacao: "",
            licenca_ms: ""
        },
        horario: []
    });

    await pagina.waitForTimeout(900);

    const rodape = await lerRodape(pagina);

    conferir("a autorização da outra farmácia some",
        !/25351\.507967|7\.89888/.test(rodape.autorizacao || ""),
        rodape.autorizacao);

    /* E a linha some, em vez de ficar em branco: parágrafo vazio no
       rodapé abre um buraco que parece defeito de layout. */
    const escondida = await pagina.evaluate(() =>
        document.querySelector('[data-loja="autorizacao"]')?.hidden);
    conferir("e a linha fica escondida", escondida === true, String(escondida));

    /* O que ELA tem continua aparecendo — o conserto não pode apagar o
       que estava certo. */
    conferir("a farmacêutica dela continua",
        /Maria Tereza/.test(rodape.responsavel || ""), rodape.responsavel);

    /* E o CNPJ sai pontuado, como a farmácia o escreve na nota. */
    conferir("o CNPJ sai legível",
        /31\.175\.246\/0001-28/.test(rodape.identificacao || ""),
        rodape.identificacao);

    await pagina.close();
}

await navegador.close();
console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

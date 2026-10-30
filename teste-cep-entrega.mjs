/* "Vocês entregam aqui?" — a faixa de CEP da home.

   O cliente só descobria que está fora da área DEPOIS de montar o
   carrinho e preencher seis campos. A faixa responde isso na primeira
   tela.

   A ASSERÇÃO CENTRAL DESTE ARQUIVO é o que ela NÃO faz: não cota o
   frete. Geocodificando sete CEPs da área duas vezes — uma só com o
   CEP e outra com o número da casa —, a faixa de preço bateu em 4 dos
   7. Um endereço de 3,80 km virava 5,08 km; R$ 3 virava R$ 5. Mostrar
   um valor aqui e outro no fim é a surpresa que o carrinho inteiro foi
   construído para não dar.

   O que o CEP responde bem é cobertura: o erro é de ±1,3 km contra um
   raio de 8 km. Por isso quem cai DENTRO dessa margem recebe um "a
   confirmar" em vez de um "sim" que pode virar não — e é a terceira
   seção daqui.

   Nenhum serviço de terceiro é chamado de verdade: o ViaCEP e o
   Nominatim respondem de mentira. Um teste que bate no Nominatim a
   cada execução é exatamente o abuso que o limite de uma consulta por
   segundo existe para impedir.

   Uso:
     npx wrangler pages dev public --port 8821
     BASE=http://127.0.0.1:8821 CHROME_PATH=... node teste-cep-entrega.mjs
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

/* A farmácia original, que é a do HTML da raiz, e o raio dela. */
const LOJA = { lat: -23.7092450, lng: -46.5251954, raio: 8 };

/* Um grau de latitude são ~111,19 km: é assim que se encomenda uma
   distância exata sem depender de geocodificação de verdade. */
const aKm = (km) => (LOJA.lat + km / 111.19).toFixed(6);

const VIACEP = {
    cep: "09751-000",
    logradouro: "Rua Jurubatuba",
    bairro: "Baeta Neves",
    localidade: "São Bernardo do Campo",
    uf: "SP"
};

const navegador = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);

async function abrir({ km = 2, viacep = VIACEP, caminho = "/", largura = 390 } = {}) {
    const contexto = await navegador.newContext({
        viewport: { width: largura, height: 844 },
        isMobile: largura < 640, hasTouch: largura < 640
    });
    const pagina = await contexto.newPage();
    const chamadas = [];

    await pagina.route("**/viacep.com.br/**", (rota) => {
        chamadas.push("viacep");
        return rota.fulfill({
            status: 200, contentType: "application/json",
            body: JSON.stringify(viacep || { erro: true })
        });
    });

    await pagina.route("**/nominatim.openstreetmap.org/**", (rota) => {
        chamadas.push("nominatim");
        return rota.fulfill({
            status: 200, contentType: "application/json",
            body: JSON.stringify([{ lat: aKm(km), lon: String(LOJA.lng) }])
        });
    });

    await pagina.goto(BASE + caminho, { waitUntil: "domcontentloaded", timeout: 30000 });
    await pagina.waitForTimeout(2500);
    await pagina.keyboard.press("Escape").catch(() => {});
    await pagina.waitForTimeout(400);

    return { pagina, contexto, chamadas };
}

async function informar(pagina, cep = "09751000") {
    await pagina.click("#definirCep");
    await pagina.waitForTimeout(400);
    await pagina.fill("#cepEntrega", cep);
    await pagina.click("#cepConfirmar");
    await pagina.waitForTimeout(2000);
}

const faixaDiz = async (pagina) =>
    (await pagina.locator(".recado-loja").textContent() || "").replace(/\s+/g, " ").trim();

/* ---- 1. antes do CEP, e o custo de abrir a página -------------------- */
console.log("\n1. a home abre sem consultar nada");
{
    const { pagina, contexto, chamadas } = await abrir();

    const texto = await faixaDiz(pagina);
    conferir("a faixa continua com o recado de entrega", /entrega/i.test(texto), texto);
    conferir("e oferece informar o CEP", /informe seu cep/i.test(texto), texto);

    /* O Nominatim permite uma consulta por segundo. Uma faixa que
       consultasse ao abrir multiplicaria isso por todo visitante da
       home — e o site inteiro depende desse serviço para calcular
       frete. A consulta só sai no toque. */
    conferir("nenhuma consulta a serviço de mapa ao abrir",
        chamadas.length === 0, JSON.stringify(chamadas));

    await contexto.close();
}

/* ---- 2. dentro da área ----------------------------------------------- */
console.log("\n2. endereço dentro da área");
{
    const { pagina, contexto, chamadas } = await abrir({ km: 2 });
    await informar(pagina);

    const texto = await faixaDiz(pagina);

    conferir("a faixa fica pessoal: bairro e CEP",
        /Baeta Neves/.test(texto) && /09751-000/.test(texto), texto);
    conferir("e diz que entrega", /entregamos aqui/i.test(texto), texto);

    /* O PISO, não uma cotação: "a partir de". */
    conferir("com a taxa como piso, não como valor fechado",
        /a partir de R\$ ?3,00/i.test(texto), texto);

    /* A asserção que guarda a medição. Qualquer coisa que leia como
       "sua taxa é R$ X" aqui estaria errada em 1 de cada 3 endereços,
       porque o número da casa ainda não existe. */
    conferir("e sem nenhum valor apresentado como o frete dela",
        !/taxa de R\$|sua taxa|frete: ?R\$|total R\$/i.test(texto), texto);

    conferir("consultou o CEP uma vez só",
        chamadas.filter((c) => c === "nominatim").length === 1, JSON.stringify(chamadas));

    await contexto.close();
}

/* ---- 3. a borda: onde a medição não permite afirmar ------------------ */
console.log("\n3. na borda da área, a faixa não chuta");
{
    /* 8 km é exatamente o raio. O erro da medição por CEP é de ±1,3 km,
       então aqui não dá para dizer nem sim nem não com honestidade. */
    const { pagina, contexto } = await abrir({ km: LOJA.raio });
    await informar(pagina);

    const texto = await faixaDiz(pagina);

    conferir("diz que está no limite", /limite/i.test(texto), texto);
    conferir("e que confirma no fim do pedido",
        /confirmamos no fim/i.test(texto), texto);

    conferir("não afirma que entrega", !/entregamos aqui/i.test(texto), texto);
    conferir("nem que está fora", !/fora da área/i.test(texto), texto);

    await contexto.close();
}

/* ---- 4. fora da área -------------------------------------------------- */
console.log("\n4. endereço fora da área");
{
    const { pagina, contexto } = await abrir({ km: 15 });
    await informar(pagina);

    const texto = await faixaDiz(pagina);

    conferir("diz que está fora", /fora da área/i.test(texto), texto);

    /* Fora da área não pode ser um beco: a loja continua vendendo para
       quem busca, e a retirada é a saída. Dizer só "não" manda a pessoa
       embora de uma venda que ainda era possível. */
    conferir("e oferece a retirada na loja", /retirar na loja/i.test(texto), texto);

    await contexto.close();
}

/* ---- 5. o carrinho abre preenchido ------------------------------------ */
console.log("\n5. o endereço não é redigitado");
{
    const { pagina, contexto } = await abrir({ km: 2 });
    await informar(pagina);

    await pagina.goto(BASE + "/carrinho.html", { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(2500);

    const v = async (id) => (await pagina.inputValue("#" + id).catch(() => "")) || "";

    conferir("o CEP já está lá", (await v("cep")) === "09751-000", await v("cep"));
    conferir("a rua também", (await v("endereco")) === "Rua Jurubatuba", await v("endereco"));
    conferir("e o bairro", (await v("bairro")) === "Baeta Neves", await v("bairro"));

    /* O NÚMERO não vem do CEP. Preenchê-lo com qualquer coisa mandaria
       o pedido para a casa errada — e o cliente, vendo os campos
       cheios, não olharia. Fica vazio, de propósito. */
    conferir("o número fica VAZIO, porque o CEP não o conhece",
        (await v("numero")) === "", await v("numero"));

    /* A rua nasce readonly no formulário e o buscarCEP a destrava. Vinda
       daqui, ela precisa do mesmo destravamento: senão o cliente não
       consegue corrigir uma rua errada. */
    conferir("e a rua dá para corrigir",
        await pagina.locator("#endereco").evaluate((e) => !e.readOnly));

    await contexto.close();
}

/* ---- 6. apagar ------------------------------------------------------- */
console.log("\n6. o cliente pode apagar o endereço");
{
    const { pagina, contexto } = await abrir({ km: 2 });
    await informar(pagina);

    conferir("antes, a faixa é pessoal",
        /Baeta Neves/.test(await faixaDiz(pagina)));

    await pagina.click("#definirCep");
    await pagina.waitForTimeout(400);
    await pagina.click("#cepApagar");
    await pagina.waitForTimeout(600);

    const texto = await faixaDiz(pagina);
    conferir("depois, volta ao recado de sempre",
        /informe seu cep/i.test(texto) && !/Baeta Neves/.test(texto), texto);

    /* E some do aparelho de verdade, não só da tela. */
    const guardado = await pagina.evaluate(() =>
        Object.keys(localStorage).filter((k) => k.indexOf("entrega:") === 0).length);
    conferir("e sai do armazenamento do aparelho", guardado === 0, String(guardado));

    await contexto.close();
}

/* ---- 7. CEP que não existe ------------------------------------------- */
console.log("\n7. CEP que a base dos Correios não tem");
{
    const { pagina, contexto } = await abrir({ viacep: null });

    await pagina.click("#definirCep");
    await pagina.waitForTimeout(400);
    await pagina.fill("#cepEntrega", "09999999");
    await pagina.click("#cepConfirmar");
    await pagina.waitForTimeout(1500);

    const aviso = (await pagina.locator("#cepAviso").textContent() || "").trim();

    conferir("avisa que não achou", /não encontramos/i.test(aviso), aviso);

    /* E não vira um beco: o ViaCEP não tem todo CEP do Brasil, e quem
       mora num deles continua podendo comprar — a conta sai no fim,
       como sempre saiu. */
    conferir("e diz que dá para seguir comprando",
        /seguir comprando/i.test(aviso), aviso);

    await contexto.close();
}

await navegador.close();

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

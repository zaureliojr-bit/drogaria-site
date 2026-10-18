/* A taxa de entrega sai sozinha.

   O que está sendo provado, e por que cada coisa importa:

     1. terminar de digitar o endereço basta — ninguém precisa achar o
        botão. Quem não o achava chegava ao fim do pedido com
        "a calcular" no lugar do valor;
     2. o CEP SOZINHO não calcula, e está certo: a conta é sobre as
        coordenadas da porta, e o número é o cliente que digita;
     3. digitar "123" não dispara três consultas. O Nominatim pede no
        máximo uma por segundo, e abusar derruba o serviço para todo
        mundo, inclusive para nós;
     4. o mesmo endereço não é recalculado — sair e voltar do campo não
        é endereço novo;
     5. a resposta ANTIGA não vence a nova. Com duas consultas no ar e a
        primeira demorando mais, o cliente ficaria com a taxa do
        endereço que ele acabou de corrigir;
     6. retirada na loja não calcula nada;
     7. o total do pedido soma a taxa sem ninguém clicar em nada — é o
        ponto da mudança inteira.

   Uso:
     npx wrangler pages dev public --port 8821
     BASE=http://127.0.0.1:8821 CHROME_PATH=... node teste-frete-automatico.mjs
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

/* A loja fica em São Bernardo. Estas duas coordenadas ficam a poucos
   quilômetros dela, dentro da área de entrega. */
const COORD = {
    "123": { lat: -23.69, lon: -46.56 },
    "999": { lat: -23.71, lon: -46.58 }
};

const navegador = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);

async function abrirCarrinho({ atrasoPorNumero = {} } = {}) {
    const contexto = await navegador.newContext();
    const pagina = await contexto.newPage();

    const geocodificacoes = [];

    await pagina.route(/viacep\.com\.br/, (rota) => rota.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
            cep: "09751-000", logradouro: "Rua das Flores",
            bairro: "Centro", localidade: "São Bernardo do Campo", uf: "SP"
        })
    }));

    await pagina.route(/nominatim/, async (rota) => {
        const url = rota.request().url();
        geocodificacoes.push(url);

        /* O número aparece no parâmetro street, no começo: "123 Rua..." */
        const numero = (decodeURIComponent(url).match(/street=(\d+)/) || [])[1] || "";
        const atraso = atrasoPorNumero[numero] || 0;
        if (atraso) await new Promise((r) => setTimeout(r, atraso));

        const coord = COORD[numero];
        return rota.fulfill({
            status: 200, contentType: "application/json",
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(coord ? [{ lat: String(coord.lat), lon: String(coord.lon) }] : [])
        });
    });

    /* Catálogo de um produto só. O carrinho é reconciliado contra o
       catálogo a cada abertura — item que não está lá é descartado —,
       então sem dublar o catálogo o carrinho chegaria vazio e a tela de
       endereço nem apareceria.

       Dublado também por disciplina: o catálogo de verdade tem 2,6 MB e
       vive fora, e um teste que depende da rede de terceiro falha por
       motivo que não é o que ele mede. */
    await pagina.route(/produtos.*\.json|raw\.githubusercontent/, (rota) => rota.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({
            produtos: [{
                codigo: "1001", ean: "7891106000888",
                descricao: "Dipirona 500mg C/10 Comprimidos",
                precoVenda: "9.90", precoPromocao: "0",
                categoria: "MEDICAMENTOS", estoque: 50
            }]
        })
    }));

    /* Um item no carrinho: sem isso a tela de endereço nem aparece. */
    await pagina.addInitScript(() => {
        localStorage.setItem("carrinho", JSON.stringify([{
            codigo: "1001", ean: "7891106000888", nome: "Dipirona 500mg",
            preco: 9.9, qtd: 2, imagem: ""
        }]));
    });

    await pagina.goto(BASE + "/carrinho", { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(800);

    /* Entrega, e não retirada: é o modo em que existe taxa. */
    await pagina.selectOption("#tipoEntrega", "Entrega").catch(() => {});
    await pagina.waitForTimeout(300);

    return { pagina, contexto, geocodificacoes };
}

const textoFrete = (pagina) => pagina.textContent("#resultadoFrete").catch(() => "");

async function esperarTaxa(pagina, segundos = 12) {
    for (let i = 0; i < segundos * 4; i++) {
        const t = await textoFrete(pagina);
        if (/Taxa de entrega|grátis|fora da área|Não localizamos/i.test(t)) return t;
        await pagina.waitForTimeout(250);
    }
    return await textoFrete(pagina);
}

/* ---- 1. o CEP sozinho não calcula ----------------------------------- */
console.log("\n1. o CEP sozinho não basta — e está certo");
{
    const { pagina, contexto, geocodificacoes } = await abrirCarrinho();

    await pagina.fill("#cep", "09751000");
    await pagina.locator("#cep").blur();
    await pagina.waitForTimeout(2000);

    const preencheu = await pagina.inputValue("#endereco");
    conferir("o CEP preenche a rua", /Rua das Flores/.test(preencheu), preencheu);
    conferir("mas não calcula taxa nenhuma sem o número",
        geocodificacoes.length === 0, String(geocodificacoes.length));

    await contexto.close();
}

/* ---- 2. terminar o endereço basta ----------------------------------- */
console.log("\n2. terminar de digitar o número calcula sozinho");
{
    const { pagina, contexto, geocodificacoes } = await abrirCarrinho();

    await pagina.fill("#cep", "09751000");
    await pagina.locator("#cep").blur();
    await pagina.waitForTimeout(1200);

    await pagina.fill("#numero", "123");

    const texto = await esperarTaxa(pagina);
    conferir("a taxa aparece sem ninguém clicar em nada",
        /Taxa de entrega|grátis/i.test(texto), texto);

    /* O ponto da mudança: o total do pedido já tem a entrega dentro. */
    const resumo = await pagina.textContent("#resumoFrete").catch(() => "");
    conferir("e o resumo deixa de dizer 'a calcular'",
        !/a calcular/i.test(resumo), resumo);

    conferir("uma geocodificação, não três",
        geocodificacoes.length === 1, String(geocodificacoes.length));

    await contexto.close();
}

/* ---- 3. digitação não vira enxurrada de consultas -------------------- */
console.log("\n3. digitar devagar não dispara uma consulta por tecla");
{
    const { pagina, contexto, geocodificacoes } = await abrirCarrinho();

    await pagina.fill("#cep", "09751000");
    await pagina.locator("#cep").blur();
    await pagina.waitForTimeout(1200);

    /* Uma tecla de cada vez, com pausa menor que a espera de digitação:
       é como alguém digita "123" de verdade. */
    await pagina.type("#numero", "123", { delay: 200 });
    await esperarTaxa(pagina);

    conferir("três teclas, uma consulta só",
        geocodificacoes.length === 1, String(geocodificacoes.length));

    await contexto.close();
}

/* ---- 4. o mesmo endereço não recalcula ------------------------------- */
console.log("\n4. sair e voltar do campo não é endereço novo");
{
    const { pagina, contexto, geocodificacoes } = await abrirCarrinho();

    await pagina.fill("#cep", "09751000");
    await pagina.locator("#cep").blur();
    await pagina.waitForTimeout(1200);
    await pagina.fill("#numero", "123");
    await esperarTaxa(pagina);

    const antes = geocodificacoes.length;

    await pagina.locator("#numero").click();
    await pagina.locator("#numero").blur();
    await pagina.waitForTimeout(1500);

    conferir("não consultou de novo", geocodificacoes.length === antes,
        `${antes} → ${geocodificacoes.length}`);

    /* Mas o botão, que é o caminho de tentar de novo, recalcula. */
    await pagina.click("#btnCalcularFrete");
    await pagina.waitForTimeout(1500);
    conferir("o botão ainda força o recálculo",
        geocodificacoes.length === antes + 1, String(geocodificacoes.length));

    await contexto.close();
}

/* ---- 5. a resposta velha não vence a nova ---------------------------- */
console.log("\n5. corrigir o endereço no meio do cálculo");
{
    /* O 123 demora 4s; o 999 responde na hora. O cliente digita 123,
       se arrepende e troca por 999 — e a resposta do 123 chega depois.
       Sem a guarda, ela sobrescreveria a taxa certa. */
    const { pagina, contexto } = await abrirCarrinho({ atrasoPorNumero: { "123": 4000 } });

    await pagina.fill("#cep", "09751000");
    await pagina.locator("#cep").blur();
    await pagina.waitForTimeout(1200);

    await pagina.fill("#numero", "123");
    await pagina.waitForTimeout(1200);          // a consulta lenta saiu
    await pagina.fill("#numero", "999");        // e o cliente corrigiu

    const logoDepois = await esperarTaxa(pagina);
    const kmDoCorrigido = (logoDepois.match(/([\d,.]+) km/) || [])[1];

    conferir("a taxa do endereço corrigido aparece",
        !!kmDoCorrigido, logoDepois);

    /* Agora a parte que importa: a resposta lenta do 123 chega AQUI,
       depois de tudo. Se ela vencer, o km na tela muda — e o cliente
       paga a entrega de um endereço que ele já corrigiu. */
    await pagina.waitForTimeout(5000);

    const depoisDaVelha = await textoFrete(pagina);
    const kmFinal = (depoisDaVelha.match(/([\d,.]+) km/) || [])[1];

    conferir("e a resposta atrasada do endereço antigo NÃO a substitui",
        kmFinal === kmDoCorrigido, `${kmDoCorrigido} km → ${kmFinal} km`);

    await contexto.close();
}

/* ---- 6. retirada na loja --------------------------------------------- */
console.log("\n6. quem retira na loja não paga nem calcula");
{
    const { pagina, contexto, geocodificacoes } = await abrirCarrinho();

    await pagina.selectOption("#tipoEntrega", "Retirada").catch(() => {});
    await pagina.waitForTimeout(300);
    await pagina.fill("#cep", "09751000").catch(() => {});
    await pagina.waitForTimeout(2000);

    conferir("nenhuma consulta de mapa", geocodificacoes.length === 0,
        String(geocodificacoes.length));

    await contexto.close();
}

await navegador.close();
console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

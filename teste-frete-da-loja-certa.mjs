/* A taxa de entrega é medida DESTA farmácia.

   O defeito, visto no ar na filial de Diadema:

     o cliente digitava o CEP dele, o site mostrava distância, taxa e
     "dentro da área de entrega" — tudo calculado a partir da farmácia
     de São Bernardo, a 11 km dali.

   Nada falhava. Não havia erro no console, nem campo vazio, nem aviso.
   A tela mostrava "Taxa de entrega: R$ 3,00 (2,1 km)" com a mesma
   confiança de sempre, e o valor ia para o pedido.

   A CAUSA ERA DUPLA, E AS DUAS PARTES ESTÃO AQUI

   1. O formulário de filial do painel não tinha campo de latitude e
      longitude. Toda filial criada por ele nasceu sem coordenada — não
      foi descuido de quem cadastrou, foi campo que não existia.

   2. O loja.js só trocava LOJA_LAT quando o valor era um número
      válido. Coordenada nula fazia a linha não rodar, e o que ficava
      valendo era a constante escrita no script.js: a da PRIMEIRA
      farmácia. A cautela de "só sobrescreve se vier bom" era o próprio
      defeito.

   É a mesma armadilha do rodapé que publicava a licença sanitária da
   vizinha. A diferença é que ali o erro era visível para quem conhecia
   as duas lojas; aqui ele sai em dinheiro, na conta de um cliente que
   não tem como desconfiar.

   Uso:
     npx wrangler pages dev public --port 8821
     BASE=http://127.0.0.1:8821 CHROME_PATH=... node teste-frete-da-loja-certa.mjs
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

const CATALOGO = { produtos: [
    { codigo: "1", ean: "7891106005001", descricao: "Dipirona Sódica 500mg Com/10",
      marca: "EMS", precoVenda: 30, categoria: "GENERICO", estoque: 30, temEstoque: true }
] };

/* As coordenadas reais das duas: a principal em São Bernardo, a filial
   em Diadema. Estão a uns 10 km uma da outra, o que é mais que o raio
   de entrega — então usar a errada não é um arredondamento, é a
   diferença entre "entregamos" e "fora da área". */
const SAO_BERNARDO = { latitude: -23.7092450, longitude: -46.5251954 };

const FILIAL_SEM_COORDENADA = {
    slug: "prudente-01",
    nome: "Drogaria Mais Barato-Prudente",
    logradouro: "Rua Prudente de Morais", numero: "19",
    bairro: "Casa Grande", cidade: "Diadema", uf: "SP", cep: "09960-500",
    whatsapp: "5511951388388",
    farmaceutico: "Dra Maria Tereza Olivera Dias Farina", crf: "127136",
    rotulo_responsavel: "Farmacêutica responsável",
    latitude: null, longitude: null,
    raio_entrega_km: 8, frete_gratis_acima: 0, fuso: "America/Sao_Paulo"
};

const navegador = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);

async function abrirCarrinho(loja) {

    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 1000 } });
    const pagina = await contexto.newPage();

    const consultasAoMapa = [];

    await pagina.addInitScript(() => {
        navigator.sendBeacon = () => false;
        try {
            localStorage.setItem("loja-atual", "prudente-01");
            localStorage.setItem("carrinho", JSON.stringify([
                { codigo: "1", ean: "7891106005001", nome: "Dipirona Sódica 500mg Com/10",
                  preco: 30, qtd: 1 }
            ]));
        } catch { /* aba privada */ }
    });

    /* A GENÉRICA VEM PRIMEIRO, e a de /loja depois.

       No Playwright a rota registrada por último é consultada antes —
       e com a ordem invertida a genérica engolia a de /loja, devolvendo
       uma resposta sem o campo `loja`. O carregarLoja desistia em
       silêncio, o cadastro nunca era adotado, e o teste media o
       comportamento padrão achando que media o da filial. Custou sete
       falhas que não eram do código. */
    await pagina.route(/farmatech-pedidos-proxy/, (rota) => rota.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ ok: true, promocoes: [], quantidade: [], banners: [] })
    }));

    await pagina.route(/farmatech-pedidos-proxy[^/]*\/loja(\?|$)/, (rota) => rota.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ loja, horario: [], visual: null })
    }));

    await pagina.route(/raw\.githubusercontent|produtos.*\.json/, (rota) => rota.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(CATALOGO)
    }));

    await pagina.route(/viacep\.com\.br/, (rota) => rota.fulfill({
        status: 200, contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ logradouro: "Rua Prudente de Morais",
                               bairro: "Casa Grande", localidade: "Diadema", uf: "SP" })
    }));

    /* O geocodificador do cliente. Devolve um ponto em Diadema, a 400m
       da filial — e a 10 km da farmácia principal. É essa diferença que
       denuncia de qual loja a conta foi feita. */
    await pagina.route(/nominatim\.openstreetmap\.org/, (rota) => {
        consultasAoMapa.push(rota.request().url());
        return rota.fulfill({
            status: 200, contentType: "application/json",
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify([{ lat: "-23.6861", lon: "-46.6180" }])
        });
    });

    await pagina.goto(BASE + "/carrinho", { waitUntil: "domcontentloaded" });
    await pagina.waitForTimeout(2200);

    return { pagina, contexto, consultasAoMapa };
}

/* ---- 1. a filial sem coordenada não herda a da vizinha -------------- */
console.log("\n1. filial cadastrada sem latitude e longitude");
{
    const { pagina, contexto } = await abrirCarrinho(FILIAL_SEM_COORDENADA);

    const estado = await pagina.evaluate(() => ({
        bandeira: typeof LOJA_SEM_COORDENADA !== "undefined" ? LOJA_SEM_COORDENADA : null,
        lat: typeof LOJA_LAT !== "undefined" ? LOJA_LAT : null
    }));

    conferir("o site percebe que a loja não tem coordenada",
        estado.bandeira === true, JSON.stringify(estado));

    /* Esta é a asserção que vale o arquivo. A constante pode continuar
       com o valor antigo — o que não pode é alguém MEDIR com ela. */
    await pagina.selectOption("#tipoEntrega", "Entrega");
    await pagina.waitForTimeout(300);
    await pagina.fill("#cep", "09960-500");
    await pagina.waitForTimeout(900);
    await pagina.fill("#numero", "19");
    await pagina.click("#btnCalcularFrete");
    await pagina.waitForTimeout(1500);

    const resultado = (await pagina.textContent("#resultadoFrete") || "").replace(/\s+/g, " ");

    conferir("não inventa taxa nenhuma",
        !/R\$\s*\d/.test(resultado), resultado);

    conferir("e diz que a loja confirma no WhatsApp",
        /WhatsApp/i.test(resultado), resultado);

    const resumo = (await pagina.textContent("#resumoFrete") || "").trim();
    conferir('o resumo mostra "a combinar", e não "a calcular"',
        resumo === "a combinar", resumo);

    await contexto.close();
}

/* ---- 2. e o pedido não fica preso por causa disso -------------------- */
console.log("\n2. o pedido continua saindo");
{
    /* A trava "calcule a taxa antes de finalizar" existe para o caso
       normal. Mantida aqui, ela trancaria no último botão o pedido de
       uma filial inteira — e o cliente não tem como saber o que fazer,
       porque o botão de calcular não resolve. */
    const { pagina, contexto } = await abrirCarrinho(FILIAL_SEM_COORDENADA);

    await pagina.selectOption("#tipoEntrega", "Entrega");
    await pagina.waitForTimeout(300);
    await pagina.fill("#nome", "Maria Teste");
    await pagina.fill("#telefone", "11954664429");
    await pagina.fill("#cep", "09960-500");
    await pagina.waitForTimeout(900);
    await pagina.fill("#numero", "19");
    await pagina.selectOption("#pagamento", "Pix");
    await pagina.waitForTimeout(300);

    let abriuWhats = false;
    await pagina.route(/wa\.me|api\.whatsapp\.com/, (rota) => {
        abriuWhats = true;
        return rota.fulfill({ status: 200, contentType: "text/html", body: "ok" });
    });
    pagina.on("popup", () => { abriuWhats = true; });

    await pagina.click(".btn-finalizar");
    await pagina.waitForTimeout(1800);

    const avisou = (await pagina.textContent("#toast") || "");

    conferir("não trava pedindo para calcular a taxa",
        !/calcule a taxa/i.test(avisou), avisou);

    await contexto.close();
}

/* ---- 3. com coordenada, tudo volta ao normal ------------------------ */
console.log("\n3. a mesma filial, agora com coordenada");
{
    const comCoordenada = {
        ...FILIAL_SEM_COORDENADA,
        latitude: -23.6889, longitude: -46.6203
    };

    const { pagina, contexto } = await abrirCarrinho(comCoordenada);

    const estado = await pagina.evaluate(() => ({
        bandeira: LOJA_SEM_COORDENADA,
        lat: LOJA_LAT, lng: LOJA_LNG
    }));

    conferir("a bandeira baixa", estado.bandeira === false, JSON.stringify(estado));

    /* A prova de que a conta mudou de origem: a coordenada em uso é a
       de Diadema, e não a de São Bernardo que estava escrita no
       script.js. */
    conferir("e a coordenada em uso é a DELA",
        Math.abs(estado.lat - comCoordenada.latitude) < 1e-9
        && Math.abs(estado.lat - SAO_BERNARDO.latitude) > 0.01,
        JSON.stringify(estado));

    await pagina.selectOption("#tipoEntrega", "Entrega");
    await pagina.waitForTimeout(300);
    await pagina.fill("#cep", "09960-500");
    await pagina.waitForTimeout(900);
    await pagina.fill("#numero", "19");
    await pagina.click("#btnCalcularFrete");
    await pagina.waitForTimeout(1500);

    const resultado = (await pagina.textContent("#resultadoFrete") || "").replace(/\s+/g, " ");

    conferir("a taxa volta a ser calculada", /R\$\s*\d/.test(resultado), resultado);

    /* O ponto do cliente está a ~400m da filial e a ~10km da principal.
       Uma distância grande aqui significaria que a conta foi feita da
       loja errada — que é o defeito inteiro, em um número. */
    const km = Number((resultado.match(/\(([\d,.]+)\s*km\)/) || [])[1]?.replace(",", "."));

    conferir(`e a distância é de poucos quilômetros — ${km} km`,
        Number.isFinite(km) && km < 3, resultado);

    await contexto.close();
}

/* ---- 4. a Ilha Nula -------------------------------------------------- */
console.log("\n4. zero nos dois eixos não é coordenada");
{
    /* O caso real, visto no ar no dia seguinte ao conserto anterior.

       O worker devolvia 0 para qualquer valor negativo — a função
       nasceu para dinheiro, onde negativo não existe, e coordenada no
       Brasil é negativa nos dois eixos. A filial de Diadema foi salva
       em latitude 0, longitude 0: o Golfo da Guiné.

       E a bandeira de "esta loja não tem coordenada" NÃO disparou,
       porque 0 é um número finito. O site calculou com confiança a
       distância até a África e disse ao cliente, em vermelho:
       "Endereço fora da área de entrega (5672,1 km)". */
    const { pagina, contexto } = await abrirCarrinho({
        ...FILIAL_SEM_COORDENADA, latitude: 0, longitude: 0
    });

    const estado = await pagina.evaluate(() => ({
        bandeira: LOJA_SEM_COORDENADA, lat: LOJA_LAT
    }));

    conferir("o site trata 0/0 como loja sem coordenada",
        estado.bandeira === true, JSON.stringify(estado));

    await pagina.selectOption("#tipoEntrega", "Entrega");
    await pagina.waitForTimeout(300);
    await pagina.fill("#cep", "09960-500");
    await pagina.waitForTimeout(900);
    await pagina.fill("#numero", "78");
    await pagina.click("#btnCalcularFrete");
    await pagina.waitForTimeout(1500);

    const resultado = (await pagina.textContent("#resultadoFrete") || "").replace(/\s+/g, " ");

    conferir("não manda o cliente embora com 'fora da área'",
        !/fora da área/i.test(resultado), resultado);

    conferir("e nenhuma distância de milhares de quilômetros",
        !/\d{3,}[.,]?\d*\s*km/i.test(resultado), resultado);

    await contexto.close();
}

await navegador.close();

console.log(falhas ? `\n${falhas} falha(s).\n` : "\nTudo certo.\n");
process.exit(falhas ? 1 : 0);

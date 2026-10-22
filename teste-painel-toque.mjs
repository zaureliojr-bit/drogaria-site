/* O toque de pedido novo.

   A reclamação da loja foi curta: "o barulho está muito baixo". Por
   trás dela há três coisas, e as três são testáveis sem ouvir nada:

     1. o som precisa SER mais alto que o de antes (era ganho 0,25 numa
        senoide, que é a forma de onda que menos aparece em ambiente
        barulhento — balcão, ar condicionado, televisão da sala de
        espera);
     2. ele precisa continuar tocando enquanto o pedido estiver parado.
        Alarme que apita uma vez e cala não cumpre função nenhuma:
        quem atende o balcão e volta acha que parou;
     3. e precisa parar quando alguém aceita o pedido — senão a farmácia
        desliga o som no primeiro dia e nunca mais liga.

   O Web Audio é trocado por um de mentira antes de a página carregar,
   que anota o que foi pedido. Não dá para medir decibel num teste, mas
   dá para provar a forma do som e, principalmente, a CADÊNCIA.

   Uso:
     npx wrangler pages dev public --port 8821
     BASE=http://127.0.0.1:8821 CHROME_PATH=... node teste-painel-toque.mjs
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

const PEDIDO_NOVO = {
    ref: "057681125", criado_em: Date.now() - 60000, cliente: "Maria Gorete",
    telefone: "11954664429", entrega: "Entrega", endereco: "Rua Tal, 10",
    pagamento: "Pix", subtotal: 32.99, frete: 0, total: 32.99,
    tem_receita: 0, status: "novo", itens: []
};

const navegador = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);

async function abrirPainel(pedidos) {

    const contexto = await navegador.newContext();
    const pagina = await contexto.newPage();

    /* O Web Audio de mentira. Anota cada oscilador, cada ganho e cada
       toque, com o instante em que aconteceu. */
    await pagina.addInitScript(() => {

        window.__toques = [];

        const nodeFalso = () => ({
            connect() {}, disconnect() {},
            gain: valorFalso(), frequency: valorFalso(),
            threshold: valorFalso(), ratio: valorFalso(),
            attack: valorFalso(), release: valorFalso(), knee: valorFalso()
        });

        function valorFalso() {
            return {
                value: 0,
                setValueAtTime(v) { this.value = v; return this; },
                exponentialRampToValueAtTime(v) { this.value = Math.max(this.value, v); return this; },
                linearRampToValueAtTime(v) { this.value = v; return this; }
            };
        }

        class ContextoFalso {
            constructor() { this.state = "running"; this.currentTime = 0; }
            resume() { this.state = "running"; return Promise.resolve(); }
            createDynamicsCompressor() {
                const n = nodeFalso();
                registrar({ tipo: "compressor" });
                return n;
            }
            createGain() {
                const n = nodeFalso();
                n.gain = valorFalso();
                registrar({ tipo: "gain", no: n });
                return n;
            }
            createOscillator() {
                const n = nodeFalso();
                n.type = "sine";
                n.start = () => registrar({ tipo: "start", onda: n.type, hz: n.frequency.value });
                n.stop = () => {};
                return n;
            }
        }

        function registrar(evento) {
            window.__toques.push({ ...evento, quando: Date.now() });
        }

        window.AudioContext = ContextoFalso;
        window.webkitAudioContext = ContextoFalso;
    });

    await pagina.route("**/farmatech-pedidos-proxy*/**", async (rota) => {
        const url = new URL(rota.request().url());

        const responder = (dados, status = 200) => rota.fulfill({
            status, contentType: "application/json",
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(dados)
        });

        if (url.pathname === "/sessao") {
            return responder({ dono: false, loja: { slug: "mais-barato", nome: "Drogaria Mais Barato", temSenhaPropria: true } });
        }
        if (url.pathname === "/fila") return responder({ pedidos: pedidos(), abertos: ["novo", "separando"] });
        if (url.pathname === "/status") return responder({ ok: true });
        if (url.pathname === "/clientes") return responder({ clientes: [] });
        if (url.pathname === "/resumo") return responder({ dias: 30, hoje: {}, periodo: {}, porDia: [], topProdutos: [], recentes: [], aguardandoReceita: 0 });
        if (url.pathname.startsWith("/catalogo")) return responder({ pendente: false });
        return responder({});
    });

    await pagina.goto(BASE + "/painel", { waitUntil: "domcontentloaded" });
    await pagina.fill("#senha", "senha-qualquer");
    await pagina.click("#btnEntrar");
    await pagina.waitForSelector("#conteudo:not([style*='display: none'])", { timeout: 20000 });

    return { pagina, contexto };
}

const toques = (pagina) => pagina.evaluate(() =>
    window.__toques.filter((t) => t.tipo === "start" && t.hz > 100));

/* ---- 1. o som em si ------------------------------------------------- */
console.log("\n1. não é mais a notinha de aplicativo");
{
    let fila = [PEDIDO_NOVO];
    const { pagina, contexto } = await abrirPainel(() => fila);

    await pagina.waitForTimeout(1500);

    const tocados = await toques(pagina);

    conferir("tocou ao achar pedido novo", tocados.length > 0, JSON.stringify(tocados));

    /* Senoide é o que sumia no barulho do balcão: sem harmônico nenhum,
       ela não atravessa ambiente. */
    conferir("e nenhuma campainha é senoide",
        tocados.every((t) => t.onda !== "sine"), JSON.stringify(tocados.map((t) => t.onda)));

    /* Duas campainhas de afinação diferente, como o aparelho de disco. */
    const agudas = new Set(tocados.filter((t) => t.hz > 500).map((t) => t.hz));
    conferir(`duas campainhas, não uma — ${[...agudas].join(" e ")} Hz`,
        agudas.size === 2, JSON.stringify([...agudas]));

    /* O martelo: o que faz o "trriiimmm". Sem ele são dois apitos
       parados, e apito parado é alarme de micro-ondas. */
    const martelo = await pagina.evaluate(() =>
        window.__toques.filter((t) => t.tipo === "start" && t.hz > 5 && t.hz < 60));
    conferir(`tem martelo batendo entre as duas — ${martelo[0]?.hz} Hz`,
        martelo.length > 0 && martelo[0].hz >= 15 && martelo[0].hz <= 30,
        JSON.stringify(martelo));

    /* Mais alto que o de antes, que era 0,25. */
    const volume = await pagina.evaluate(() =>
        Math.max(...window.__toques.filter((t) => t.tipo === "gain").map((t) => t.no.gain.value)));
    conferir(`o volume subiu bem acima do antigo 0,25 — ${volume}`,
        volume >= 0.6, String(volume));

    /* Volume alto com dois osciladores somados estoura e vira chiado. */
    const temLimitador = await pagina.evaluate(() =>
        window.__toques.some((t) => t.tipo === "compressor"));
    conferir("com limitador na saída, para não estourar", temLimitador);

    await contexto.close();
}

/* ---- 2. insistir é o ponto ------------------------------------------ */
console.log("\n2. toca até alguém aceitar");
{
    let fila = [PEDIDO_NOVO];
    const { pagina, contexto } = await abrirPainel(() => fila);

    /* Cada badalada acende as DUAS campainhas, então o número de
       toques é o de osciladores dividido por dois. */
    const badaladas = async () => (await toques(pagina)).length / 2;

    await pagina.waitForTimeout(1000);
    const antes = await badaladas();

    /* Nove segundos com o pedido parado. Na cadência antiga, de 20s,
       isso daria ZERO repetição — a loja ouviria uma badalada e mais
       nada pelos vinte segundos seguintes, que é exatamente a queixa.
       Na cadência de telefone, duas ou mais. */
    await pagina.waitForTimeout(9000);
    const depois = await badaladas();

    conferir(`repetiu enquanto o pedido estava parado — ${antes} → ${depois} badaladas`,
        depois >= antes + 2, `${antes} → ${depois}`);

    await contexto.close();
}

/* ---- 3. e para quando aceita ---------------------------------------- */
console.log("\n3. e cala quando o pedido é aceito");
{
    let fila = [PEDIDO_NOVO];
    const { pagina, contexto } = await abrirPainel(() => fila);

    await pagina.waitForSelector('[data-novo-status="separando"]', { timeout: 10000 });

    /* "Iniciar separação" é o aceitar: tira o pedido de "novo". */
    fila = [{ ...PEDIDO_NOVO, status: "separando" }];
    await pagina.click('[data-novo-status="separando"]');
    await pagina.waitForTimeout(1500);

    const marcoZero = (await toques(pagina)).length;

    await pagina.waitForTimeout(7000);
    const depois = (await toques(pagina)).length;

    /* Alarme que continua depois de aceito é alarme que a farmácia
       desliga no primeiro dia — e aí ela deixa de ouvir o próximo. */
    conferir("não tocou mais nenhuma vez", depois === marcoZero, `${marcoZero} → ${depois}`);

    await contexto.close();
}

/* ---- 4. o interruptor continua valendo ------------------------------ */
console.log("\n4. quem desliga, desliga");
{
    let fila = [PEDIDO_NOVO];
    const { pagina, contexto } = await abrirPainel(() => fila);

    await pagina.waitForTimeout(1000);
    await pagina.uncheck("#somLigado");

    const marcoZero = (await toques(pagina)).length;
    await pagina.waitForTimeout(6000);
    const depois = (await toques(pagina)).length;

    conferir("com o som desligado, silêncio mesmo com pedido parado",
        depois === marcoZero, `${marcoZero} → ${depois}`);

    await contexto.close();
}

await navegador.close();

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

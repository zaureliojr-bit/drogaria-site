/* O painel visto por três pessoas diferentes.

   A aba Filiais e a chave de dono existem para resolver um problema de
   operação — cadastrar a senha de uma farmácia nova, dar suporte sem
   pedir a senha de ninguém. Mas elas criam o risco oposto: alguém
   mexendo na loja errada, ou vendo o que não é seu.

   Então o que está sendo provado aqui é, nesta ordem:

     1. a dona de UMA farmácia não vê a aba, e nada muda para ela — é o
        caso de hoje, e é o que não pode quebrar;
     2. o dono da plataforma vê a aba, troca de filial e cadastra senha;
     3. o cabeçalho X-Painel-Loja acompanha TODAS as chamadas depois de
        trocar de filial. Esta é a que mais importa: uma chamada que
        esqueça o cabeçalho salva banner na farmácia errada, responde 200
        e não parece erro nenhum.

   O worker é interceptado, então o teste roda sem senha de verdade e sem
   tocar em produção.

   Uso:
     npx wrangler pages dev public --port 8811 &
     BASE=http://127.0.0.1:8811 node teste-painel-filiais.mjs
*/

import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:8811";

const LOJAS = [
    { slug: "mais-barato", nome: "Drogaria Mais Barato", cidade: "São Bernardo do Campo",
      uf: "SP", ativo: 1, tem_senha: 0, banco: null, prefixo_r2: null },
    { slug: "farma-centro", nome: "Farmácia do Centro", cidade: "Cuiabá",
      uf: "MT", ativo: 1, tem_senha: 1, banco: "DB_FARMA_CENTRO", prefixo_r2: "farma-centro",
      logo: "https://exemplo.test/logo-centro.png", cor: "#0a7d4b" },
    /* Uma filial cadastrada e desligada. É o estado de quem está
       preparando a loja nova, ou de quem tirou uma do ar — e o painel não
       pode oferecer "operar nesta" numa delas. */
    { slug: "farma-parada", nome: "Farmácia Parada", cidade: "Santos",
      uf: "SP", ativo: 0, tem_senha: 0, banco: null, prefixo_r2: null }
];

const conferencias = {};

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

/* Abre o painel com o worker de mentira no lugar do de verdade.

   `dono` decide o que a rota /sessao responde — é exatamente o que o
   worker real decide comparando a senha com a DONO_KEY. */
async function abrirPainel({ dono, subdominiosNoAr = [] }) {
    const contexto = await navegador.newContext();
    const pagina = await contexto.newPage();

    /* Os domínios das farmácias. `subdominiosNoAr` é a lista das que já
       foram adicionadas em Custom Domains na Cloudflare; as outras não
       existem — e abortar é o que o navegador faz de verdade com DNS que
       não resolve. */
    /* O padronizador, dublado por uma página que só anota o que recebe.

       Servida DA ORIGEM dele, e não de outra: o painel confere
       evento.origin antes de mandar a senha, e de uma origem qualquer o
       recado não sairia — o teste passaria por engano, provando o
       contrário do que quer. */
    await pagina.route(/farmatech-padronizador[^/]*\/?$|farmatech-padronizador[^/]*\/[^/]*$/,
        (rota) => rota.fulfill({
            status: 200,
            contentType: "text/html; charset=utf-8",
            body: `<!doctype html><meta charset="utf-8"><title>dublê</title><script>
                window.recebidos = [];
                addEventListener("message", (e) => window.recebidos.push(e.data));
                try { parent.postMessage({ tipo: "padronizador-pronto" }, "*"); } catch (e) {}
            </script>`
        }));

    await pagina.route(/drogalink\.com\.br/, (rota) => {
        const apelido = new URL(rota.request().url()).hostname.split(".")[0];
        if (!subdominiosNoAr.includes(apelido)) return rota.abort("namenotresolved");
        return rota.fulfill({ status: 200, contentType: "image/png", body: "" });
    });

    /* Tudo que o painel pediu ao worker, para o teste conferir depois
       quais cabeçalhos foram junto. */
    const chamadas = [];

    await pagina.route("**/farmatech-pedidos-proxy*/**", async (rota) => {
        const pedido = rota.request();
        const url = new URL(pedido.url());
        chamadas.push({
            caminho: url.pathname,
            metodo: pedido.method(),
            loja: pedido.headers()["x-painel-loja"] || "",
            chave: pedido.headers()["x-painel-key"] || "",
            corpo: pedido.postData() || ""
        });

        const responder = (dados, status = 200) => rota.fulfill({
            status,
            contentType: "application/json",
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(dados)
        });

        const slug = pedido.headers()["x-painel-loja"] || "mais-barato";

        if (url.pathname === "/sessao") {
            const loja = LOJAS.find((l) => l.slug === slug) || LOJAS[0];
            return responder({ dono, loja: { slug: loja.slug, nome: loja.nome, temSenhaPropria: !!loja.tem_senha } });
        }
        /* O método importa: /lojas é GET para listar e POST para
           cadastrar. Sem conferir, o POST caía na listagem e respondia
           200 com a lista — e a tela, sem o "faltaFazer" na resposta,
           mostrava o passo a passo pela metade em vez de falhar. Levou
           um bom tempo para eu perceber que o defeito era deste
           arquivo, e não do painel. */
        if (url.pathname === "/lojas" && pedido.method() === "GET") {
            if (!dono) return responder({ erro: "Só o dono da plataforma vê a lista de lojas." }, 403);
            return responder({ lojas: LOJAS });
        }
        if (url.pathname === "/loja/senha") {
            return responder({ ok: true, loja: JSON.parse(pedido.postData() || "{}").slug });
        }
        if (url.pathname === "/lojas" && pedido.method() === "POST") {
            const corpo = JSON.parse(pedido.postData() || "{}");
            const slug = corpo.slug;
            if (LOJAS.some((l) => l.slug === slug)) {
                return responder({ erro: `Já existe uma filial com o apelido "${slug}".` }, 409);
            }
            const banco = "DB_" + String(slug).replace(/-/g, "_").toUpperCase();
            LOJAS.push({ slug, nome: corpo.nome, cidade: corpo.cidade, uf: corpo.uf,
                         ativo: 0, tem_senha: 0, banco, prefixo_r2: slug });
            return responder({ sucesso: true, slug, banco, prefixo: slug,
                faltaFazer: { bancoD1: "farmatech-" + slug, binding: banco, schema: "pedidos-proxy/schema.sql" } });
        }
        const conferindo = url.pathname.match(/^\/lojas\/([a-z0-9-]+)\/conferir$/);
        if (conferindo) {
            /* Primeira conferência reprova; a segunda aprova — é o que
               acontece de verdade quando a pessoa vai à Cloudflare e
               cria o banco entre uma e outra. */
            conferencias[conferindo[1]] = (conferencias[conferindo[1]] || 0) + 1;
            const pronta = conferencias[conferindo[1]] > 1;
            const loja = LOJAS.find((l) => l.slug === conferindo[1]) || {};
            return responder({
                slug: conferindo[1], nome: loja.nome, ativo: !!loja.ativo, podeLigar: pronta,
                conferencias: [
                    { o: "cadastro", ok: true, recado: "Está na tabela de lojas." },
                    { o: "horário", ok: true, recado: "7 faixas cadastradas." },
                    { o: "banco cadastrado", ok: true, recado: `Aponta para ${loja.banco}.` },
                    { o: "binding ligado ao worker", ok: pronta,
                      recado: pronta ? "Ligado e respondendo."
                                     : `O binding ${loja.banco} não existe neste worker.` },
                    { o: "tabelas de operação", ok: pronta, recado: pronta ? "Tem as tabelas." : "Sem as tabelas." },
                    { o: "banco separado do principal", ok: pronta, recado: pronta ? "É só desta filial." : "—" },
                    { o: "senha", ok: false, recado: "Ainda sem senha própria." }
                ]
            });
        }
        const marca = url.pathname.match(/^\/lojas\/([a-z0-9-]+)\/(cor|logo)$/);
        if (marca) {
            const loja = LOJAS.find((l) => l.slug === marca[1]);
            if (loja) {
                if (marca[2] === "logo") {
                    loja.logo = pedido.method() === "DELETE" ? null : "https://exemplo.test/novo.png";
                } else {
                    const c = JSON.parse(pedido.postData() || "{}").cor;
                    loja.cor = c || null;
                }
            }
            return responder({ sucesso: true });
        }
        const ligando = url.pathname.match(/^\/lojas\/([a-z0-9-]+)\/ativo$/);
        if (ligando) {
            const loja = LOJAS.find((l) => l.slug === ligando[1]);
            if (loja) loja.ativo = JSON.parse(pedido.postData() || "{}").ativo === false ? 0 : 1;
            return responder({ sucesso: true, slug: ligando[1], ativo: !!(loja && loja.ativo) });
        }
        if (url.pathname === "/fila") return responder({ pedidos: [], abertos: ["novo"] });
        if (url.pathname === "/resumo") {
            return responder({
                dias: 30, hoje: { pedidos: 0, faturamento: 0 },
                periodo: { pedidos: 0, faturamento: 0, ticket: 0 },
                porDia: [], topProdutos: [], recentes: [], aguardandoReceita: 0,
                maisProcurados: [], naoEncontrados: []
            });
        }
        if (url.pathname === "/clientes") return responder({ clientes: [] });
        if (url.pathname === "/banners/todos") return responder({ banners: [], podeEnviarArquivo: false });
        if (url.pathname === "/promocoes/todas") return responder({ promocoes: [], lotes: [] });
        if (url.pathname === "/encartes") return responder({ encartes: [], podeEnviarArquivo: false });
        if (url.pathname.startsWith("/catalogo")) return responder({ pendente: false });

        return responder({ erro: "Rota não encontrada." }, 404);
    });

    await pagina.goto(BASE + "/painel", { waitUntil: "domcontentloaded" });
    return { pagina, contexto, chamadas };
}

async function entrar(pagina, senha, filial = "") {
    await pagina.fill("#senha", senha);
    if (filial) await pagina.fill("#lojaLogin", filial);
    await pagina.click("#btnEntrar");
    await pagina.waitForSelector("#conteudo:not([style*='display: none'])", { timeout: 20000 });
    await pagina.waitForTimeout(800);
}

/* ---- 1. a dona de uma farmácia só ----------------------------------- */
console.log("\n1. quem tem uma farmácia só: nada muda");
{
    const { pagina, contexto, chamadas } = await abrirPainel({ dono: false });
    await entrar(pagina, "senha-da-loja");

    const abaVisivel = await pagina.isVisible("#botaoAbaLojas");
    conferir("a aba Filiais não aparece", !abaVisivel);

    conferir("e o painel abriu normalmente", await pagina.isVisible("#abaFila"));

    /* Sem filial escolhida, nenhuma chamada carrega o cabeçalho — é o
       painel de hoje, byte por byte. */
    conferir("nenhuma chamada manda X-Painel-Loja",
        chamadas.every((c) => c.loja === ""),
        chamadas.filter((c) => c.loja).map((c) => c.caminho).join(","));

    await contexto.close();
}

/* ---- 2. o dono da plataforma ---------------------------------------- */
console.log("\n2. o dono da plataforma");
let chamadasDoDono;
{
    const { pagina, contexto, chamadas } = await abrirPainel({ dono: true });
    chamadasDoDono = chamadas;
    await entrar(pagina, "chave-de-dono");

    conferir("a aba Filiais aparece", await pagina.isVisible("#botaoAbaLojas"));

    await pagina.click("#botaoAbaLojas");
    await pagina.waitForSelector("#listaLojas table", { timeout: 15000 });

    const texto = await pagina.textContent("#listaLojas");
    conferir("lista as três farmácias",
        /Mais Barato/.test(texto) && /Farmácia do Centro/.test(texto) && /Farmácia Parada/.test(texto),
        texto.replace(/\s+/g, " ").slice(0, 120));
    conferir("mostra quem ainda entra com a chave do worker", /a do worker/.test(texto),
        texto.replace(/\s+/g, " ").slice(0, 160));
    conferir("e em qual delas você está", /você está aqui/.test(texto));

    /* "Ver o site" leva à vitrine DA FILIAL em que se está operando.

       Com uma farmácia só dava para ser relativo. Com várias, a raiz é o
       site de outra — e abrir o site do concorrente achando que é o seu é
       confusão barata de evitar. É também o que destrava mudar o painel
       para um domínio próprio da FarmaTech: lá, a raiz não é site de
       farmácia nenhuma. */
    const verSite = await pagina.getAttribute("#verSite", "href");
    conferir("o link do site aponta para a vitrine da filial",
        /\/loja\/mais-barato$/.test(verSite || ""), verSite);

    const opcoes = await pagina.$$eval("#senhaLojaAlvo option", (os) => os.map((o) => o.value));
    conferir("o seletor de senha traz as três", opcoes.length === 3, opcoes.join(","));

    /* A tabela tinha sete colunas e passava de 1280px: ganhava barra de
       rolagem lateral, e o que sumia para fora era o começo do nome da
       farmácia. Agora são cinco. Este teste mede, em vez de confiar no
       olho. */
    const largura = await pagina.evaluate(() => {
        const caixa = document.getElementById("listaLojas");
        return { visivel: caixa.clientWidth, conteudo: caixa.scrollWidth };
    });
    conferir("a tabela cabe na largura da tela, sem rolagem lateral",
        largura.conteudo <= largura.visivel + 1,
        `conteúdo ${largura.conteudo}px em ${largura.visivel}px`);

    /* Filial desligada não pode oferecer "Operar nesta": o worker só
       autentica em loja ativa, então o clique daria 401 e o painel
       mandaria de volta ao login dizendo "Senha incorreta" — com a senha
       certa. Oferecer ação que não funciona é pior do que não oferecer. */
    const botoes = await pagina.$$eval("[data-ir-para]", (bs) => bs.map((b) => b.dataset.irPara));
    conferir("a filial desligada não oferece o botão de operar",
        !botoes.includes("farma-parada"), botoes.join(","));
    /* No lugar do botão de entrar, a filial desligada oferece terminar o
       cadastro — que é o que falta de verdade. Uma filial fica desligada
       porque o cadastro está pela metade, e mandar a pessoa "ligar" sem
       dizer o que falta só adia a descoberta. */
    const terminar = await pagina.$$eval("[data-terminar]", (bs) => bs.map((b) => b.dataset.terminar));
    conferir("e oferece terminar o cadastro dela",
        terminar.includes("farma-parada"), terminar.join(","));

    /* Banco em branco só é certo na primeira linha. Em qualquer outra é
       cadastro pela metade, e o worker recusa a filial com 503 — melhor
       ver o aviso aqui, cadastrando, do que quando a dona tentar entrar. */
    conferir("avisa qual filial está sem banco próprio",
        /falta o banco próprio/.test(texto), texto.replace(/\s+/g, " ").slice(0, 160));
    conferir("e não acusa a primeira, que usa o banco original de direito",
        (texto.match(/falta o banco próprio/g) || []).length === 1,
        String((texto.match(/falta o banco próprio/g) || []).length));

    /* Cadastrar a senha de uma filial. */
    await pagina.selectOption("#senhaLojaAlvo", "farma-centro");
    await pagina.fill("#senhaLojaNova", "senha-boa-da-filial");
    await pagina.fill("#senhaLojaConfirma", "senha-boa-da-filial");
    await pagina.click("#btnSalvarSenhaLoja");
    await pagina.waitForTimeout(1200);

    const envio = chamadas.find((c) => c.caminho === "/loja/senha");
    conferir("manda a senha ao worker", !!envio, "nenhuma chamada a /loja/senha");
    conferir("com a filial escolhida",
        envio && JSON.parse(envio.corpo).slug === "farma-centro", envio && envio.corpo);

    const aviso = await pagina.textContent("#avisoLojas");
    conferir("e avisa que salvou", /salva/i.test(aviso || ""), aviso);

    /* Os campos têm de ficar vazios: senha digitada que fica na tela
       acaba num print de WhatsApp. */
    const sobrou = await pagina.evaluate(() => [
        document.getElementById("senhaLojaNova").value,
        document.getElementById("senhaLojaConfirma").value
    ]);
    conferir("os campos de senha são limpos na hora", sobrou.every((v) => v === ""), JSON.stringify(sobrou));

    await contexto.close();
}

/* ---- 3. trocar de filial -------------------------------------------- */
console.log("\n3. trocar de filial: o cabeçalho acompanha TUDO");
{
    const { pagina, contexto, chamadas } = await abrirPainel({ dono: true });
    await entrar(pagina, "chave-de-dono");

    await pagina.click("#botaoAbaLojas");
    await pagina.waitForSelector("#listaLojas table", { timeout: 15000 });

    /* Trocar recarrega a página de propósito: fila, banners, promoções e
       encartes já estão em memória, e uma tela meio trocada — fila de
       uma filial com os banners de outra — é pior do que dois segundos
       de espera. */
    /* Zera na NAVEGAÇÃO, e não antes do clique.

       Trocar de filial é location.reload(), e a página velha ainda
       dispara o que estava em voo nos milissegundos antes de morrer —
       com a loja antiga no cabeçalho, porque era nela que aquela sessão
       estava, corretamente. Zerando antes do clique, essa chamada
       moribunda caía na conta da página nova e o teste acusava um
       vazamento que não existe.

       Limpar quando o documento novo começa é o corte certo: o que vem
       depois é, por definição, da filial escolhida. */
    pagina.on("framenavigated", (quadro) => {
        if (quadro === pagina.mainFrame()) chamadas.length = 0;
    });

    await pagina.click('[data-ir-para="farma-centro"]');
    await pagina.waitForSelector("#conteudo:not([style*='display: none'])", { timeout: 25000 });
    await pagina.waitForTimeout(1500);

    /* Abre as abas que buscam dados, para o teste cobrir as chamadas que
       só acontecem quando alguém clica. */
    for (const aba of ["relatorios", "banners", "promocoes", "encarte"]) {
        await pagina.click(`[data-aba="${aba}"]`);
        await pagina.waitForTimeout(500);
    }

    const semLoja = chamadas.filter((c) => c.loja !== "farma-centro");
    conferir(`as ${chamadas.length} chamadas foram todas para a filial escolhida`,
        semLoja.length === 0,
        semLoja.map((c) => `${c.metodo} ${c.caminho} (loja="${c.loja}")`).join(" | "));

    const caminhos = [...new Set(chamadas.map((c) => c.caminho))];
    conferir("e cobriram fila, relatório, banners, promoções e encartes",
        ["/fila", "/resumo", "/banners/todos", "/promocoes/todas", "/encartes"]
            .every((c) => caminhos.includes(c)),
        caminhos.join(","));

    /* O padronizador roda num quadro e fala com o porteiro por conta
       própria. Se ele não souber a filial, o porteiro cai na farmácia
       original — e publicar o catálogo escreve no site da loja errada,
       calado. Com a chave de dono é pior: nada dá 401, e a tela diz
       "catálogo atualizado" enquanto o site da filial segue igual.

       Então o recado que entrega a senha tem de entregar a filial. */
    await pagina.click('[data-aba="padronizador"]');
    await pagina.waitForTimeout(2500);

    const quadro = pagina.frames().find((f) => /padronizador/.test(f.url()));
    conferir("o quadro do padronizador carregou", !!quadro,
        pagina.frames().map((f) => f.url()).join(" | ").slice(0, 120));

    const recebidos = quadro ? await quadro.evaluate(() => window.recebidos || []) : [];
    const entregaDaSenha = recebidos.find((m) => m && m.tipo === "senha-painel");

    conferir("o painel entrega a senha ao padronizador", !!entregaDaSenha,
        JSON.stringify(recebidos).slice(0, 120));
    conferir("e entrega a FILIAL junto, no mesmo recado",
        entregaDaSenha?.loja === "farma-centro",
        JSON.stringify(entregaDaSenha && { ...entregaDaSenha, senha: "···" }));

    await contexto.close();
}

/* ---- 3b. cadastrar uma filial pela tela ----------------------------- */
console.log("\n3b. cadastrar filial sem escrever uma linha de SQL");
{
    const { pagina, contexto, chamadas } = await abrirPainel({ dono: true });
    await entrar(pagina, "chave-de-dono");
    await pagina.click("#botaoAbaLojas");
    await pagina.waitForSelector("#listaLojas table", { timeout: 15000 });

    /* O apelido é sugerido a partir do nome, e não imposto: ele vai no
       endereço da vitrine e no nome do banco, então quem cadastra tem de
       poder encurtar. */
    await pagina.fill("#novaNome", "Drogaria São José");
    await pagina.waitForTimeout(200);
    const sugerido = await pagina.inputValue("#novaSlug");
    conferir("sugere o apelido a partir do nome, sem acento",
        sugerido === "drogaria-sao-jose", sugerido);

    await pagina.fill("#novaSlug", "sao-jose");
    await pagina.fill("#novaCidade", "Osasco");
    await pagina.fill("#novaUf", "SP");
    await pagina.fill("#novaWhats", "(11) 95555-4444");
    await pagina.fill("#novaFarmaceutico", "Dr. Pedro Alves");
    await pagina.fill("#novaCrf", "112233");
    await pagina.selectOption("#novaRotulo", "Farmacêutico responsável");

    await pagina.click("#btnCriarFilial");
    await pagina.waitForSelector("#passosFilial:not([hidden])", { timeout: 15000 });

    const envio = chamadas.find((c) => c.caminho === "/lojas" && c.metodo === "POST");
    conferir("manda o cadastro ao worker", !!envio);
    const corpoEnviado = JSON.parse(envio.corpo);
    conferir("com o apelido que a pessoa escolheu, não o sugerido",
        corpoEnviado.slug === "sao-jose", corpoEnviado.slug);
    conferir("e com o rótulo do responsável escolhido à mão",
        corpoEnviado.rotuloResponsavel === "Farmacêutico responsável", corpoEnviado.rotuloResponsavel);

    /* Quem não mexeu na cor não manda cor nenhuma. O seletor nasce com o
       azul da casa porque precisa nascer com alguma coisa; gravar esse
       valor prenderia a filial no tom antigo no dia em que a cor padrão
       do sistema mudar. */
    const mandouCor = chamadas.some((c) => /\/cor$/.test(c.caminho));
    conferir("não grava cor quando ninguém escolheu uma", !mandouCor,
        chamadas.filter((c) => /\/cor$/.test(c.caminho)).map((c) => c.corpo).join(","));

    const passos = await pagina.textContent("#passosFilial");
    conferir("mostra o nome do banco D1 a criar", /farmatech-sao-jose/.test(passos), passos.slice(0, 160));
    conferir("e o nome do binding a ligar", /DB_SAO_JOSE/.test(passos), passos.slice(0, 160));

    /* A conferência é a trava: enquanto o banco não existe, não há botão
       de ligar. É o que impede uma filial meio cadastrada chegar ao
       cliente e mostrar 503 — ou, pior, a fila da farmácia errada. */
    await pagina.click("#btnConferirFilial");
    await pagina.waitForSelector("#resultadoConferencia .conferencia", { timeout: 15000 });

    const semBanco = await pagina.textContent("#resultadoConferencia");
    conferir("reprova enquanto o binding não existe", /não existe neste worker/.test(semBanco),
        semBanco.replace(/\s+/g, " ").slice(0, 140));
    conferir("e não oferece o botão de ligar", !(await pagina.isVisible("#btnLigarFilial")));

    /* Agora o banco existe (o worker de mentira aprova na segunda). */
    await pagina.click("#btnConferirFilial");
    await pagina.waitForSelector("#btnLigarFilial", { timeout: 15000 });
    conferir("depois de criado o banco, aparece o botão de ligar", true);

    await pagina.click("#btnLigarFilial");
    await pagina.waitForTimeout(1200);

    const ligou = chamadas.find((c) => c.caminho === "/lojas/sao-jose/ativo");
    conferir("liga a filial", !!ligou && JSON.parse(ligou.corpo).ativo === true, ligou && ligou.corpo);

    const lista = await pagina.textContent("#listaLojas");
    conferir("e ela entra na lista", /São José|Drogaria São José|sao-jose/.test(lista),
        lista.replace(/\s+/g, " ").slice(0, 160));

    const aviso = await pagina.textContent("#avisoLojas");
    conferir("lembrando que falta a senha dela", /senha/.test(aviso || ""), aviso);

    /* E o outro lado: escolher a cor manda a cor. Sem este par, a
       asserção de cima passaria também se a tela nunca mandasse cor
       nenhuma. */
    chamadas.length = 0;
    await pagina.fill("#novaNome", "Farmácia Verde");
    await pagina.fill("#novaSlug", "verde");
    await pagina.fill("#novaCorTexto", "#0a7d4b");
    await pagina.click("#btnCriarFilial");
    await pagina.waitForTimeout(1500);

    const envioCor = chamadas.find((c) => /\/cor$/.test(c.caminho));
    conferir("mas grava a cor quando alguém escolhe uma",
        !!envioCor && JSON.parse(envioCor.corpo).cor === "#0a7d4b",
        envioCor && envioCor.corpo);

    await contexto.close();
}

/* ---- 4. apelido de filial errado ------------------------------------ */
console.log("\n4. quem digita o apelido errado não fica preso");
{
    const contexto = await navegador.newContext();
    const pagina = await contexto.newPage();

    /* O worker responde 401 igual para "senha errada" e para "essa
       farmácia não existe" — de propósito, para não contar a quem tenta
       quais lojas existem. O preço é que o painel não sabe qual dos dois
       foi, então solta a filial junto com a senha: sem isso, quem errou
       o apelido ficaria tentando a senha certa para sempre. */
    await pagina.route("**/farmatech-pedidos-proxy*/**", (rota) => rota.fulfill({
        status: 401,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ erro: "Não autorizado." })
    }));

    await pagina.goto(BASE + "/painel", { waitUntil: "domcontentloaded" });
    await pagina.fill("#senha", "qualquer");
    await pagina.fill("#lojaLogin", "filial-que-nao-existe");
    await pagina.click("#btnEntrar");
    await pagina.waitForTimeout(1500);

    const guardado = await pagina.evaluate(() => ({
        senha: sessionStorage.getItem("painelKey"),
        loja: sessionStorage.getItem("painelLoja")
    }));
    conferir("a filial errada não fica guardada", !guardado.loja, JSON.stringify(guardado));
    conferir("a tela de login volta", await pagina.isVisible("#login"));

    await contexto.close();
}

/* ---- 5. a marca de uma filial já cadastrada -------------------------- */
console.log("\n5. trocar e tirar a marca de uma filial");
{
    const { pagina, contexto, chamadas } = await abrirPainel({ dono: true });
    await entrar(pagina, "chave-de-dono");
    await pagina.click("#botaoAbaLojas");
    await pagina.waitForSelector("#listaLojas table", { timeout: 15000 });

    /* O bloco mostra o que está valendo AGORA: sem isso, quem vai trocar
       o logotipo não tem como saber se a filial já tem um. */
    await pagina.selectOption("#marcaLojaAlvo", "farma-centro");
    await pagina.waitForTimeout(300);

    const atual = await pagina.innerHTML("#marcaAtual");
    conferir("mostra o logotipo que está valendo",
        /logo-centro\.png/.test(atual), atual.slice(0, 120));
    conferir("e a cor que está valendo", /#0a7d4b/.test(atual), atual.slice(0, 200));

    const corNoSeletor = await pagina.inputValue("#marcaCorTexto");
    conferir("o seletor começa na cor da filial, não na da casa",
        corNoSeletor === "#0a7d4b", corNoSeletor);

    /* A filial que usa a identidade da casa diz isso, em vez de mostrar
       um espaço vazio que pareceria defeito. */
    await pagina.selectOption("#marcaLojaAlvo", "mais-barato");
    await pagina.waitForTimeout(300);
    const semMarca = await pagina.textContent("#marcaAtual");
    conferir("quem usa a marca da casa diz isso",
        /sem logotipo próprio/.test(semMarca) && /sem cor própria/.test(semMarca),
        semMarca.replace(/\s+/g, " "));

    const botaoLimpar = await pagina.isVisible("#btnLimparLogo");
    conferir("o botão de limpar logotipo existe", botaoLimpar);

    /* Limpar numa filial que já usa a marca da casa não chama o worker:
       avisa e para. */
    chamadas.length = 0;
    await pagina.click("#btnLimparLogo");
    await pagina.waitForTimeout(500);
    conferir("limpar quem já usa o da casa não chama o worker",
        !chamadas.some((c) => /\/logo$/.test(c.caminho)),
        chamadas.map((c) => c.caminho).join(","));
    const aviso = await pagina.textContent("#avisoLojas");
    conferir("e explica por quê", /já usa o logotipo da casa/.test(aviso || ""), aviso);

    /* Agora na filial que TEM logotipo. O confirm é respondido com sim —
       ele existe porque apagar leva o arquivo junto. */
    await pagina.selectOption("#marcaLojaAlvo", "farma-centro");
    await pagina.waitForTimeout(300);

    pagina.once("dialog", (d) => d.accept());
    chamadas.length = 0;
    await pagina.click("#btnLimparLogo");
    await pagina.waitForTimeout(1200);

    const apagou = chamadas.find((c) => /\/lojas\/farma-centro\/logo$/.test(c.caminho));
    conferir("manda DELETE do logotipo", !!apagou && apagou.metodo === "DELETE",
        apagou ? apagou.metodo : "nenhuma chamada");

    const depois = await pagina.textContent("#marcaAtual");
    conferir("e a tela passa a dizer que usa o da casa",
        /sem logotipo próprio/.test(depois), depois.replace(/\s+/g, " "));
    conferir("mas a cor continua lá", /#0a7d4b/.test(await pagina.innerHTML("#marcaAtual")));

    /* A filial escolhida não pode se perder quando a lista é redesenhada:
       quem acabou de mexer na terceira teria de procurá-la de novo. */
    const aindaEscolhida = await pagina.inputValue("#marcaLojaAlvo");
    conferir("a filial escolhida continua escolhida", aindaEscolhida === "farma-centro", aindaEscolhida);

    /* Limpar a cor não pergunta: não há arquivo a perder. */
    chamadas.length = 0;
    await pagina.click("#btnLimparCor");
    await pagina.waitForTimeout(1200);
    const limpouCor = chamadas.find((c) => /\/cor$/.test(c.caminho));
    conferir("limpar a cor manda vazio ao worker",
        !!limpouCor && JSON.parse(limpouCor.corpo).cor === "", limpouCor && limpouCor.corpo);

    const semNada = await pagina.textContent("#marcaAtual");
    conferir("e aí a filial usa a identidade da casa inteira",
        /sem logotipo próprio/.test(semNada) && /sem cor própria/.test(semNada),
        semNada.replace(/\s+/g, " "));

    /* Salvar sem escolher nada não deve mandar requisição nenhuma — nem
       apagar a cor de quem só queria trocar o logotipo. */
    chamadas.length = 0;
    await pagina.click("#btnSalvarMarca");
    await pagina.waitForTimeout(600);
    conferir("salvar sem nada escolhido não chama o worker",
        !chamadas.some((c) => /\/(cor|logo)$/.test(c.caminho)),
        chamadas.map((c) => c.caminho).join(","));

    await contexto.close();
}

/* ---- 6. o link que se manda para a dona da farmácia ----------------- */
console.log("\n6. o link de mandar para o cliente");
{
    /* Nenhum subdomínio adicionado ainda: é o estado do dia em que a
       filial acaba de ser cadastrada. */
    const { pagina, contexto } = await abrirPainel({ dono: true, subdominiosNoAr: [] });
    await entrar(pagina, "chave-do-dono");
    await pagina.click('[data-aba="lojas"]');
    await pagina.waitForSelector("#listaLojas [data-copiar]");
    await pagina.waitForTimeout(1500);

    const semDominio = await pagina.getAttribute(
        '#listaLojas [data-slug="mais-barato"]', "data-copiar");
    conferir("sem o subdomínio de pé, manda o endereço que FUNCIONA",
        /\/loja\/mais-barato$/.test(semDominio), semDominio);
    conferir("e não um drogalink.com.br que ainda não abre",
        !/drogalink\.com\.br/.test(semDominio), semDominio);

    await contexto.close();
}
{
    /* Agora a Mais Barato está em Custom Domains, e a outra não. */
    const { pagina, contexto } = await abrirPainel({
        dono: true, subdominiosNoAr: ["mais-barato"]
    });
    await entrar(pagina, "chave-do-dono");
    await pagina.click('[data-aba="lojas"]');
    await pagina.waitForSelector("#listaLojas [data-copiar]");

    /* A conferência é assíncrona de propósito — a lista aparece antes
       dela terminar. Esperar o botão trocar é esperar o que o olho da
       pessoa vê.

       Espera do lado do Node, e não com waitForFunction: a CSP do painel
       não tem 'unsafe-eval', e o Playwright injeta a função por eval. O
       erro que isso dá não diz nada sobre CSP — diz só que a condição
       nunca ficou verdadeira. */
    for (let i = 0; i < 60; i++) {
        const atual = await pagina.getAttribute(
            '#listaLojas [data-slug="mais-barato"]', "data-copiar");
        if (atual && atual.includes("drogalink.com.br")) break;
        await pagina.waitForTimeout(250);
    }

    const comDominio = await pagina.getAttribute(
        '#listaLojas [data-slug="mais-barato"]', "data-copiar");
    conferir("com o subdomínio de pé, passa a mandar o endereço DELA",
        comDominio === "https://mais-barato.drogalink.com.br/", comDominio);

    const outra = await pagina.$('#listaLojas [data-slug="farma-centro"]');
    if (outra) {
        const linkOutra = await outra.getAttribute("data-copiar");
        conferir("e a filial sem subdomínio continua no endereço da plataforma",
            /\/loja\/farma-centro$/.test(linkOutra), linkOutra);
    }

    /* O título é o que aparece ao parar o mouse em cima: tem de ser o
       mesmo link que vai ser copiado, e não o de antes da troca. */
    const titulo = await pagina.getAttribute(
        '#listaLojas [data-slug="mais-barato"]', "title");
    conferir("e o que o mouse mostra é o mesmo que o clique copia",
        titulo === comDominio, titulo);

    await contexto.close();
}

await navegador.close();
console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

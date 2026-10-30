/* A barra de abas do rodapé, no celular.

   Quatro destinos fixos — Início, Categorias, Encarte e Carrinho —,
   que é a gramática que o cliente já conhece de todo aplicativo de
   entrega. Antes disso, fora da home a única forma de voltar era o
   logotipo no topo ou o botão do navegador.

   O que este arquivo guarda são as quatro coisas que quebram sozinhas
   quando alguém mexe no rodapé:

     1. no COMPUTADOR a barra não existe. Rodapé fixo com ícones é
        gramática de telefone, e o --abas-h em 0 é o que mantém as
        contas de todo o resto (padding do corpo, barra do carrinho,
        toast) válidas sem um `if` em cada uma;

     2. as DUAS barras se empilham. O resumo do carrinho sobe para
        ACIMA das abas; se ele cobrir a navegação, quem pôs um item no
        carrinho fica preso sem poder voltar para a vitrine;

     3. a barra não tapa o fim da página. Ela é fixa: sem o padding no
        corpo, o último produto e o rodapé ficam embaixo dela;

     4. a folha de categorias funciona das duas formas — na home ela
        filtra ali mesmo, e de outra página ela navega com a família no
        endereço e a home filtra ao abrir.

   Uso:
     npx wrangler pages dev public --port 8821
     BASE=http://127.0.0.1:8821 CHROME_PATH=... node teste-abas.mjs
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

const navegador = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);

async function abrir(caminho = "/", largura = 390, altura = 844) {
    const contexto = await navegador.newContext({
        viewport: { width: largura, height: altura },
        isMobile: largura < 640,
        hasTouch: largura < 640
    });
    const pagina = await contexto.newPage();
    await pagina.goto(BASE + caminho, { waitUntil: "domcontentloaded", timeout: 30000 });
    /* O aviso de entrada pode aparecer por cima; Escape o dispensa. */
    await pagina.waitForTimeout(2500);
    await pagina.keyboard.press("Escape").catch(() => {});
    await pagina.waitForTimeout(400);
    return { pagina, contexto };
}

/* ---- 1. as quatro abas, e qual está acesa ---------------------------- */
console.log("\n1. as quatro abas no celular");
{
    const { pagina, contexto } = await abrir("/");

    const rotulos = await pagina.$$eval(".abas .aba-rotulo",
        (els) => els.map((e) => e.textContent.trim()));

    conferir("são quatro", rotulos.length === 4, JSON.stringify(rotulos));
    conferir("Início · Categorias · Encarte · Carrinho",
        rotulos.join("|") === "Início|Categorias|Encarte|Carrinho", JSON.stringify(rotulos));

    conferir("a da home está acesa",
        (await pagina.locator(".aba-acesa .aba-rotulo").textContent()) === "Início");

    /* Cor sozinha não basta: quem não distingue bem as cores, e quem usa
       leitor de tela, precisam de outra pista. */
    conferir("e marcada como página atual para o leitor de tela",
        await pagina.locator('.aba[aria-current="page"]').count() === 1);

    /* Alvo de toque: a barra fica na zona do polegar, usada em pé e
       andando. 44px é o mínimo; aqui queremos mais. */
    const alturas = await pagina.$$eval(".abas .aba",
        (els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    conferir(`cada aba tem pelo menos 48px de altura — ${alturas.join(", ")}`,
        alturas.every((h) => h >= 48), JSON.stringify(alturas));

    await contexto.close();
}

/* ---- 2. a aba acesa acompanha a página ------------------------------- */
console.log("\n2. em outra página, outra aba acende");
{
    const { pagina, contexto } = await abrir("/encarte.html");
    conferir("no encarte, a aba Encarte",
        (await pagina.locator(".aba-acesa .aba-rotulo").textContent().catch(() => "")) === "Encarte");
    await contexto.close();

    const carrinho = await abrir("/carrinho.html");
    conferir("no carrinho, a aba Carrinho",
        (await carrinho.pagina.locator(".aba-acesa .aba-rotulo").textContent().catch(() => "")) === "Carrinho");
    await carrinho.contexto.close();

    /* A página de produto não tem aba própria. Acender "Início" ali
       diria ao cliente que ele está num lugar onde não está. */
    const politicas = await abrir("/politicas.html");
    conferir("nas políticas, nenhuma acesa",
        await politicas.pagina.locator(".aba-acesa").count() === 0);
    await politicas.contexto.close();
}

/* ---- 3. no computador a barra não existe ----------------------------- */
console.log("\n3. no computador, nada de barra");
{
    const { pagina, contexto } = await abrir("/", 1440, 900);

    const visivel = await pagina.locator(".abas").isVisible().catch(() => false);
    conferir("a barra não aparece", !visivel);

    /* A medida publicada tem de acompanhar: é ela que posiciona a barra
       do carrinho e o toast. Uma conta errada aqui põe o resumo do
       carrinho flutuando a 58px do pé da tela, sem nada embaixo. */
    const h = await pagina.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--abas-h").trim());
    conferir(`o --abas-h volta a zero — ${h}`, h === "0px", h);

    await contexto.close();
}

/* ---- 4. as duas barras se empilham ----------------------------------- */
console.log("\n4. o resumo do carrinho sobe para ACIMA das abas");
{
    const { pagina, contexto } = await abrir("/");

    await pagina.locator('[data-acao="add"], .btn-add').first().click();
    await pagina.waitForTimeout(1200);

    const m = await pagina.evaluate(() => {
        const abas = document.querySelector(".abas");
        const carrinho = document.querySelector(".carrinho");
        if (!abas || !carrinho) return null;
        const a = abas.getBoundingClientRect(), c = carrinho.getBoundingClientRect();
        return { abasTopo: Math.round(a.top), carrinhoBase: Math.round(c.bottom) };
    });

    conferir("as duas estão na tela", m !== null, JSON.stringify(m));

    /* A asserção que importa: o resumo termina onde as abas começam. Se
       ele passar disso, está tapando a navegação — e quem adicionou um
       item fica sem como voltar para a vitrine. */
    conferir(`o resumo termina onde as abas começam — ${JSON.stringify(m)}`,
        m && m.carrinhoBase <= m.abasTopo + 1, JSON.stringify(m));

    /* O contador amarelo na aba do carrinho. */
    const conta = pagina.locator("#abaCarrinhoConta");
    conferir("o contador da aba aparece com o item",
        await conta.isVisible() && (await conta.textContent()).trim() === "1",
        await conta.textContent().catch(() => "-"));

    await contexto.close();
}

/* ---- 5. a barra não come o fim da página ----------------------------- */
console.log("\n5. o fim da página continua alcançável");
{
    const { pagina, contexto } = await abrir("/");

    /* A home monta mais seções conforme a pessoa rola, então um
       scrollTo só para no meio: desce até a altura parar de crescer. */
    for (let i = 0; i < 25; i++) {
        const antes = await pagina.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
            return document.body.scrollHeight;
        });
        await pagina.waitForTimeout(400);
        const depois = await pagina.evaluate(() => document.body.scrollHeight);
        if (depois === antes) break;
    }
    await pagina.waitForTimeout(600);

    const sobra = await pagina.evaluate(() => {
        const abas = document.querySelector(".abas");
        const rodape = document.querySelector(".rodape");
        if (!abas || !rodape) return null;
        /* Quanto do rodapé ficou acima da barra depois de rolar tudo. */
        return Math.round(abas.getBoundingClientRect().top - rodape.getBoundingClientRect().bottom);
    });

    /* Rolando até o fim, o rodapé tem de terminar ACIMA da barra. Sem o
       padding no corpo ele fica por baixo e o CNPJ, o CRF e o aviso da
       Portaria 344 somem — que é justamente o que já aconteceu uma vez
       neste site, por outro motivo. */
    conferir(`o rodapé termina acima da barra — sobra ${sobra}px`,
        sobra !== null && sobra >= 0, String(sobra));

    await contexto.close();
}

/* ---- 6. a folha de categorias ---------------------------------------- */
console.log("\n6. categorias: filtra na home, navega de fora dela");
{
    const { pagina, contexto } = await abrir("/");

    await pagina.click('[data-abrir="categorias"]');
    await pagina.waitForTimeout(500);

    const linhas = await pagina.locator(".cat-linha").count();
    conferir(`a folha abre com as famílias — ${linhas}`, linhas > 5, String(linhas));

    /* "Todos os produtos" primeiro: é a saída de quem entrou numa
       categoria e quer a vitrine inteira de volta. O chip "Todos" lá em
       cima fica fora da tela depois de rolar. */
    const primeira = (await pagina.locator(".cat-linha").first().textContent()).trim();
    conferir("e começa por 'Todos os produtos'",
        /todos os produtos/i.test(primeira), primeira);

    conferir("nenhuma categoria de medicamento sob receita na lista",
        await pagina.locator('.cat-linha[data-familia="receita"]').count() === 0);

    await pagina.locator('.cat-linha[data-familia="cabelo"]').click();
    await pagina.waitForTimeout(900);

    conferir("escolher fecha a folha", await pagina.locator(".cat-folha").count() === 0);

    const ativo = (await pagina.locator("button.ativo").first().textContent().catch(() => "")).trim();
    conferir(`e filtra a vitrine ali mesmo — "${ativo}"`, /cabelo/i.test(ativo), ativo);

    await contexto.close();
}

/* ---- 7. de outra página, a categoria leva para a home filtrada ------- */
console.log("\n7. a mesma folha, vinda do encarte");
{
    const { pagina, contexto } = await abrir("/encarte.html");

    await pagina.click('[data-abrir="categorias"]');
    await pagina.waitForTimeout(500);

    const linha = pagina.locator('.cat-linha[href="/?familia=cabelo"]');
    /* ?familia= e não um hash: o sincronizarEndereco() do script.js
       reescreve o endereço como pathname + search e descarta o hash,
       então um /#f-cabelo chegava na home sem nada. E este parâmetro
       já é lido lá desde os links de campanha - uma leitura só. */
    conferir("fora da home, as linhas são links com ?familia=",
        await linha.count() === 1, String(await linha.count()));

    await linha.click();
    await pagina.waitForTimeout(3500);

    /* Chega na home, e o endereço sai limpo: o sincronizarEndereco()
       apaga o ?familia= depois de aplicar o filtro, de propósito — o
       que fica na barra é o link que a pessoa copiaria, e ele não
       carrega uma categoria que ela já esqueceu que escolheu. Por isso
       a asserção é sobre a página, não sobre o endereço. */
    conferir("chegou na home", new URL(pagina.url()).pathname === "/", pagina.url());

    /* A asserção que fecha o ciclo: não basta chegar na home, tem de
       chegar JÁ FILTRADO. Senão a pessoa escolheu "Cabelo" e recebeu a
       vitrine inteira, que lê como clique perdido. */
    const ativo = (await pagina.locator("button.ativo").first().textContent().catch(() => "")).trim();
    conferir(`e já filtrada por Cabelo — "${ativo}"`, /cabelo/i.test(ativo), ativo);

    await contexto.close();
}

await navegador.close();

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

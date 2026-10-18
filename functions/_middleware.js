/* =====================================================================
   O domínio de cada farmácia
   =====================================================================

   Cada loja da plataforma ganha o endereço dela:

       maisbarato.drogalink.com.br
       carioca.drogalink.com.br

   É o que se vende. O cliente da farmácia nunca vê o nome da
   plataforma, e a farmácia tem um endereço para pôr na sacola, no
   carimbo e no Instagram. E é degrau de upgrade: quando ela quiser
   comprar o domínio próprio dela, o site já está pronto para receber.

   Na plataforma os mesmos endereços continuam existindo:

       drogalink.com.br/loja/maisbarato

   POR QUE ISTO É UM MIDDLEWARE, E NÃO UMA ROTA

   No subdomínio da farmácia, a vitrine dela tem de responder na RAIZ. E
   a raiz é um arquivo estático (index.html), que não passa por função
   nenhuma. Middleware é o único lugar da Pages que vê toda requisição
   antes de o arquivo ser servido.

   Por isso ele é escrito para sair do caminho rápido: lê o Host, e se
   não for subdomínio de loja — que é o caso de 100% do tráfego da
   plataforma e do site de hoje — chama next() na primeira linha útil.

   NÃO EXISTE DOMÍNIO CURINGA NA PAGES

   Conferido na documentação: `*.drogalink.com.br` não é aceito como
   domínio de projeto. Cada subdomínio novo precisa ser adicionado à mão
   em Custom Domains — o que é aceitável, porque cadastrar uma filial já
   tem outros dois passos manuais na Cloudflare (criar o banco D1 e ligar
   o binding). Vira o terceiro, e está documentado no CADASTRAR-FILIAL.

   A alternativa seria um Worker na frente da Pages, cobrado por
   requisição, para economizar dois cliques por cliente. Não paga.
   ===================================================================== */

import { montarVitrine } from "./_vitrine.js";
import { montarPaginaProduto, dadosDaLoja } from "./_paginaProduto.js";

/* O domínio da plataforma. Configurável porque o endereço de teste, o de
   produção e o do dia em que a marca mudar não são o mesmo. */
function dominioDaPlataforma(env) {
    return String((env && env.DOMINIO_PLATAFORMA) || "drogalink.com.br")
        .toLowerCase().replace(/^\.+|\.+$/g, "");
}

/* Subdomínios que NÃO são farmácia.

   Sem esta lista, o dia em que alguém criar painel.drogalink.com.br o
   middleware trataria "painel" como slug de loja e mostraria a vitrine
   de uma farmácia que não existe no lugar do painel. */
const RESERVADOS = new Set([
    "www", "painel", "app", "api", "admin", "assets", "cdn", "mail", "blog", "docs"
]);

/* O que vem antes do domínio da plataforma, seja farmácia ou não. */
function prefixoDoEndereco(request, env) {
    const host = new URL(request.url).hostname.toLowerCase();
    const base = dominioDaPlataforma(env);

    if (!host.endsWith("." + base)) return "";

    const prefixo = host.slice(0, -(base.length + 1));

    /* Só um nível. "a.b.drogalink.com.br" não é loja — e aceitar isso
       abriria o site a um número infinito de endereços equivalentes, que
       é confusão para o Google e superfície para quem quer brincar. */
    if (!prefixo || prefixo.includes(".")) return "";
    if (!/^[a-z0-9-]+$/.test(prefixo)) return "";

    return prefixo;
}

/* A farmácia dona deste endereço, ou "" quando é a plataforma. */
function lojaDoEndereco(request, env) {
    const prefixo = prefixoDoEndereco(request, env);
    return RESERVADOS.has(prefixo) ? "" : prefixo;
}

export async function onRequest(contexto) {
    const { request, env, next } = contexto;

    const url = new URL(request.url);
    const caminho = url.pathname.replace(/\/+$/, "") || "/";

    /* painel.drogalink.com.br: a raiz é o PAINEL.

       O painel mora em /painel, porque ele é uma página do mesmo
       projeto da loja. Sem esta linha, quem digita o endereço do painel
       cai na vitrine da farmácia — que foi exatamente o que aconteceu
       no primeiro teste do domínio.

       Redirecionamento, e não servir a página aqui: assim o endereço na
       barra vira /painel, que é onde o _headers aplica a CSP folgada
       que o quadro do padronizador precisa. Servida na raiz, a página
       receberia a CSS restrita da vitrine e o padronizador não
       carregaria — um jeito pior de errar, porque a tela abre. */
    if (prefixoDoEndereco(request, env) === "painel" && caminho === "/") {
        return Response.redirect(url.origin + "/painel", 302);
    }

    const loja = lojaDoEndereco(request, env);

    /* O caminho de 100% do tráfego de hoje: não é subdomínio de loja,
       segue para o arquivo ou para a rota de sempre. */
    if (!loja) return next();

    /* A raiz do domínio dela é a vitrine dela. */
    if (caminho === "/") {
        return montarVitrine({ request, env, slug: loja, proprio: true });
    }

    /* /produto/<nome>-<ean> no domínio da farmácia é a página de compra
       DELA — com o preço dela e o catálogo dela.

       E canônica de si mesma. Apontar para a plataforma empurraria para
       o nosso domínio tudo que a farmácia construir no Google, que é o
       contrário de dar um endereço a ela. */
    const produto = caminho.match(/^\/produto\/(.+)$/);
    if (produto) {
        const { nome, catalogo } = await dadosDaLoja(loja, env);
        return montarPaginaProduto({
            request, env,
            rota: produto[1],
            slugLoja: loja,
            nomeLoja: nome,
            catalogo,
            proprio: true
        });
    }

    /* /loja/<outra> dentro do domínio de uma farmácia não faz sentido:
       seria a vitrine de uma concorrente servida no endereço dela.
       Manda para a raiz, que é a vitrine certa. */
    if (caminho.startsWith("/loja/")) {
        return Response.redirect(url.origin + "/", 302);
    }

    /* Carrinho, encarte, oferta, CSS, imagens: tudo igual. O que muda
       entre as farmácias é o que a vitrine e a página de produto
       carregam — e isso elas já resolvem sozinhas. */
    return next();
}

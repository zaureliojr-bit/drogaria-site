/* De qual farmácia é esta página.

   O defeito que este arquivo existe para fechar, visto na primeira
   instalação de uma segunda loja:

     - o site da filial nova mostrava o banner e o encarte da Mais Barato
     - o "Pedido rápido" abria o WhatsApp da Mais Barato
     - e o PEDIDO entrava no banco da Mais Barato

   Os três têm a mesma causa. O site perguntava ao worker "me dê os
   banners", sem dizer de quem; o worker, sem o `?loja=`, respondia com a
   primeira farmácia ativa — que é a Mais Barato. Nada disso dava erro:
   as telas abriam, bonitas, com o conteúdo da loja errada.

   O terceiro é o grave. Um pedido no site da filial caía na fila de
   outra farmácia — que o separa, o entrega e cobra por ele, sem jamais
   saber que não era dela.

   COMO A PÁGINA DESCOBRE DE QUEM É, EM TRÊS DEGRAUS

   1. O SUBDOMÍNIO. Em `mb-prudente.drogalink.com.br` não há dúvida
      possível, e por isso ele ganha de tudo: o endereço é a identidade.

   2. A META DA PÁGINA. Quem serve a vitrine e a página de produto sabe
      a loja e a escreve no HTML. Vale para o endereço da plataforma,
      `/loja/mb-prudente`, onde o domínio não diz nada.

   3. O QUE FICOU LEMBRADO. Carrinho, encarte e oferta são páginas
      estáticas: `/carrinho` é igual para todo mundo, e nem o domínio
      nem a página dizem de quem é. Então os dois degraus acima gravam a
      loja, e estes a leem.

   O terceiro degrau é o que faz o pedido chegar na farmácia certa. É
   também o mais frágil — armazenamento bloqueado o derruba —, e por
   isso os dois primeiros gravam SEMPRE que respondem, e não só quando o
   terceiro falha.

   SEM NENHUM DOS TRÊS, O SLUG É VAZIO

   E vazio quer dizer "não mande ?loja=", que é o comportamento de antes:
   o worker atende a farmácia principal. É o certo para a instalação de
   uma loja só, que é a maioria. */

(function (raiz) {

    "use strict";

    var LEMBRADO = "loja-atual";

    /* O mesmo domínio que o middleware da Pages usa. Escrito aqui porque
       este arquivo roda no navegador e não enxerga a variável dele; se
       um dia mudar, muda nos dois — e o teste-subdominio pega. */
    var DOMINIO = "drogalink.com.br";

    function limpar(valor) {
        return String(valor || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);
    }

    /* 1. O subdomínio, quando existe. Um nível só: "a.b.drogalink..."
       não é loja, pela mesma razão que no middleware — aceitar isso
       deixaria qualquer um inventar endereço de farmácia. */
    function doSubdominio() {

        var host = String(location.hostname || "").toLowerCase();

        if (host.length <= DOMINIO.length + 1) return "";
        if (host.slice(-DOMINIO.length - 1) !== "." + DOMINIO) return "";

        var prefixo = host.slice(0, -DOMINIO.length - 1);

        if (prefixo.indexOf(".") >= 0) return "";

        /* "painel" e "www" não são farmácias. */
        if (prefixo === "painel" || prefixo === "www") return "";

        return limpar(prefixo);

    }

    /* 2. A meta que o servidor escreveu. */
    function daPagina() {
        var meta = document.querySelector('meta[name="loja"]');
        return meta ? limpar(meta.content) : "";
    }

    /* 3. O que ficou da última vitrine visitada. */
    function lembrada() {
        try { return limpar(localStorage.getItem(LEMBRADO)); } catch (e) { return ""; }
    }

    function lembrar(slug) {
        if (!slug) return;
        try { localStorage.setItem(LEMBRADO, slug); } catch (e) { /* aba privada */ }
    }

    var resolvida = null;

    function slug() {

        if (resolvida !== null) return resolvida;

        var doDominio = doSubdominio();
        var daMeta = daPagina();

        /* Os dois primeiros degraus gravam sempre que respondem — é o
           que mantém o terceiro em dia para o carrinho, que vem
           depois. */
        if (doDominio) { lembrar(doDominio); resolvida = doDominio; return resolvida; }
        if (daMeta)    { lembrar(daMeta);    resolvida = daMeta;    return resolvida; }

        resolvida = lembrada();
        return resolvida;

    }

    /* O endereço de uma rota do worker, já com a farmácia dentro.

       TODA chamada ao worker passa por aqui. Era a falta disso o
       defeito: nove pontos do site montavam a URL na mão, e nenhum
       deles dizia de quem era a página. */
    function api(base, rota) {

        var endereco = String(base || "").replace(/\/+$/, "") + rota;
        var quem = slug();

        if (!quem) return endereco;

        return endereco + (endereco.indexOf("?") >= 0 ? "&" : "?")
             + "loja=" + encodeURIComponent(quem);

    }

    raiz.LojaAtual = { slug: slug, api: api, lembrar: lembrar, LEMBRADO: LEMBRADO };

})(typeof globalThis !== "undefined" ? globalThis : window);

/* =====================================================
   A BARRA DE ABAS DO CELULAR
   =====================================================

   Quatro destinos fixos no rodapé: Início, Categorias, Encarte e
   Carrinho. É o padrão que o cliente já conhece de todo aplicativo que
   usa, e resolve um problema que a vitrine tinha: fora da home, a
   única forma de voltar era o logotipo no topo ou o botão do
   navegador.

   O ENCARTE GANHA LUGAR FIXO. Ele é a peça que a loja mais trabalha e
   era a mais escondida: um link que só aparecia na home, e só enquanto
   houvesse encarte publicado dentro do prazo. Agora tem endereço certo
   em toda página. Quando não há encarte no ar, a própria página do
   encarte explica isso — melhor que um link que some.

   SÓ NO CELULAR. No computador a barra fica escondida (--abas-h vira
   0px e o CSS inteiro se ajusta sozinho): rodapé fixo com quatro
   ícones é gramática de telefone, e no desktop o cabeçalho já tem
   espaço para a navegação toda.

   A barra é montada aqui, e não escrita nas seis páginas, para não
   existir em seis cópias que divergem no dia em que alguém mexer numa
   só. O preço é ela aparecer um instante depois do HTML; como o CSS já
   reserva a altura dela, nada pula quando ela entra.
   ===================================================== */
(function () {
    "use strict";

    /* Ícones em SVG aqui dentro, e não no sprite das páginas: a
       politicas.html não carrega o sprite, e uma barra que perde os
       ícones numa página é pior que uma barra sem sprite nenhum. */
    var ICONES = {
        inicio: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5"/>',
        categorias: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/>',
        encarte: '<path d="M4 4h12a1 1 0 0 1 1 1v14H5a1 1 0 0 1-1-1z"/><path d="M17 8h2a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-2"/><path d="M7.5 8h6"/><path d="M7.5 11.5h6"/><path d="M7.5 15h3.5"/>',
        carrinho: '<circle cx="9.5" cy="20" r="1.4"/><circle cx="17.5" cy="20" r="1.4"/><path d="M2.5 3h2.2l2.3 11.2a1.4 1.4 0 0 0 1.4 1.1h8.9a1.4 1.4 0 0 0 1.4-1.1L20.5 7H6"/>'
    };

    function svg(nome) {
        return '<svg class="aba-ic" width="22" height="22" viewBox="0 0 24 24" fill="none" ' +
            'stroke="currentColor" stroke-width="1.9" stroke-linecap="round" ' +
            'stroke-linejoin="round" aria-hidden="true">' + ICONES[nome] + "</svg>";
    }

    /* Qual aba está acesa. Pelo caminho da URL, não por quem clicou:
       quem chega de um link do WhatsApp direto no carrinho tem de ver
       a aba do carrinho acesa igual. */
    function abaAtual() {
        var c = location.pathname.replace(/\/+$/, "") || "/";
        if (/carrinho/.test(c)) return "carrinho";
        if (/encarte/.test(c)) return "encarte";
        /* A página de produto e a de políticas não têm aba própria.
           Nenhuma fica acesa, em vez de acender "Início" e dizer ao
           cliente que ele está num lugar onde não está. */
        if (c === "/" || /^\/loja\/[^/]+$/.test(c) || /oferta/.test(c)) return "inicio";
        return "";
    }

    var ativa = abaAtual();

    function item(chave, rotulo, href, extra, dentro) {
        var acesa = chave === ativa;
        return '<a class="aba' + (acesa ? " aba-acesa" : "") + '" href="' + href + '"' +
            (acesa ? ' aria-current="page"' : "") +
            (extra || "") + ">" + svg(chave) + (dentro || "") +
            '<span class="aba-rotulo">' + rotulo + "</span></a>";
    }

    var barra = document.createElement("nav");
    barra.className = "abas";
    barra.setAttribute("aria-label", "Navegação principal");
    barra.innerHTML =
        item("inicio", "Início", "/") +
        /* Categorias é um botão de verdade, não um link: ele abre a
           folha aqui mesmo. Fica com href para continuar funcionando
           com o JavaScript bloqueado - aí ele leva à home, onde os
           atalhos de categoria estão. */
        item("categorias", "Categorias", "/", ' data-abrir="categorias"') +
        item("encarte", "Encarte", "/encarte.html") +
        item("carrinho", "Carrinho", "/carrinho.html", "",
            '<span class="aba-conta" id="abaCarrinhoConta" hidden>0</span>');

    document.body.appendChild(barra);

    /* ---------- o contador do carrinho ----------

       Lido do #qtdTop, que o atualizarTotais() já mantém. Um observador
       em vez de uma chamada nova dentro daquela função: assim esta
       barra não precisa que ninguém se lembre dela. Quem adicionar um
       terceiro lugar que mostre a quantidade amanhã também não vai
       precisar. */
    var fonte = document.getElementById("qtdTop");
    var conta = document.getElementById("abaCarrinhoConta");

    function sincronizar() {
        if (!fonte || !conta) return;
        var n = parseInt(fonte.textContent, 10) || 0;
        conta.textContent = n > 99 ? "99+" : String(n);
        conta.hidden = n === 0;
    }

    if (fonte && window.MutationObserver) {
        new MutationObserver(sincronizar).observe(fonte, {
            childList: true, characterData: true, subtree: true
        });
        sincronizar();
    }

    /* ---------- a folha de categorias ---------- */

    var folha = null;

    function familias() {
        /* FAMILIAS vem de familias.js, que a politicas.html não carrega.
           Sem ela a aba vira o que o href já diz: um link para a home. */
        if (typeof FAMILIAS === "undefined" || !Array.isArray(FAMILIAS)) return null;
        return FAMILIAS.filter(function (f) { return !f.receita; });
    }

    /* O ícone da família vem do sprite da página, quando ela tem um.
       A politicas.html não tem, e lá a folha nem abre (sem FAMILIAS),
       mas a verificação fica porque é barata e o dia em que alguém
       carregar familias.js sem o sprite não deve render uma fileira de
       quadrados vazios. */
    var TEM_SPRITE = !!document.getElementById("ic-fam-remedio");

    function iconeFamilia(f) {
        if (!TEM_SPRITE || !f.icone) return "";
        return '<svg class="cat-ic" width="20" height="20" aria-hidden="true">' +
            '<use href="#ic-' + f.icone + '"></use></svg>';
    }

    function montarFolha(lista) {
        var naHome = ativa === "inicio";

        /* Começa por "Todos os produtos": é a saída de quem entrou numa
           categoria e quer voltar a ver a vitrine inteira. Sem ela, a
           única forma de limpar o filtro é achar o chip "Todos" lá em
           cima, que fica fora da tela depois de rolar. */
        var itens = [{ id: "todas", nome: "Todos os produtos", icone: "home" }]
            .concat(lista);

        var linhas = itens.map(function (f) {
            var miolo = iconeFamilia(f) + "<span>" + f.nome + "</span>";
            /* Na home o filtro acontece na própria página: o mesmo
               data-acao que os atalhos usam, já atendido pelo ouvinte
               do script.js. Fora dela, navega com a família no hash e
               a home filtra ao abrir. */
            return naHome
                ? '<button class="cat-linha" data-acao="filtrar" data-familia="' + f.id + '">' +
                  miolo + "</button>"
                : '<a class="cat-linha" href="/?familia=' +
                  encodeURIComponent(f.id) + '">' + miolo + "</a>";
        }).join("");

        var el = document.createElement("div");
        el.className = "cat-folha";
        el.innerHTML =
            '<div class="cat-fundo" data-fechar="1"></div>' +
            '<div class="cat-painel" role="dialog" aria-modal="true" aria-label="Categorias">' +
            '<div class="cat-topo"><strong>Categorias</strong>' +
            '<button class="cat-x" data-fechar="1" aria-label="Fechar">&times;</button></div>' +
            '<div class="cat-lista">' + linhas + "</div></div>";
        return el;
    }

    function fechar() {
        if (!folha) return;
        folha.remove();
        folha = null;
        document.body.classList.remove("com-folha");
    }

    function abrir() {
        var lista = familias();
        if (!lista || !lista.length) return false;

        fechar();
        folha = montarFolha(lista);
        document.body.appendChild(folha);
        document.body.classList.add("com-folha");

        folha.addEventListener("click", function (ev) {
            if (ev.target.closest("[data-fechar]")) { ev.preventDefault(); fechar(); return; }
            /* Escolheu uma categoria: a folha sai de cena. Na home o
               clique ainda sobe até o ouvinte do script.js, que filtra. */
            if (ev.target.closest(".cat-linha")) setTimeout(fechar, 0);
        });

        var x = folha.querySelector(".cat-x");
        if (x) x.focus();
        return true;
    }

    document.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape") fechar();
    });

    barra.addEventListener("click", function (ev) {
        var alvo = ev.target.closest('[data-abrir="categorias"]');
        if (!alvo) return;
        /* Só impede a navegação se a folha realmente abriu. Sem
           FAMILIAS carregada, o link para a home continua valendo. */
        if (abrir()) ev.preventDefault();
    });

    /* Não há nada aqui para ler o ?familia= da folha: o script.js já
       o lê na abertura da home (a mesma rota que os links de campanha
       usam). Esta barra escreve o endereço que aquele código espera, e
       nada mais — duas leituras do mesmo parâmetro é como uma delas
       fica velha.

       A primeira versão disto usava um hash (/#f-cabelo) e não
       funcionava: o sincronizarEndereco() reescreve o endereço com
       pathname + search e deixa o hash para trás. */

})();

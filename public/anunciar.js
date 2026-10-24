/* O que anunciar nesta semana.

   A farmácia não precisa de uma agência para saber o que pôr no
   anúncio — ela já tem a resposta no próprio painel e não sabe que
   tem. O que falta é juntar três coisas que hoje moram em abas
   diferentes:

     - o que as pessoas BUSCARAM no site (demanda provada, aqui dentro,
       não estimativa de mercado);
     - o que está ENCALHADO (dinheiro parado que vira dinheiro vivo);
     - o que está PRESTES A ACABAR (e por isso não pode ser anunciado).

   A terceira é a que mais vale, e é a que ninguém lembra: pagar clique
   para levar o cliente a um produto que acabou é o pior resultado
   possível. Gasta-se o dinheiro, perde-se o cliente e ainda se ensina
   a ele que o site mente sobre o estoque.

   O QUE ESTA REGRA NUNCA SUGERE

   Nada que exija receita. Não é cautela nossa: a RDC 96/2008 proíbe
   anunciar ao público medicamento sob prescrição, e as políticas do
   Google e do Meta barram a conta de quem tenta. Um anúncio desses não
   dá multa amanhã — dá conta suspensa, e aí a loja perde também as
   campanhas que estavam certas.

   Roda sem navegador de propósito, como o estoque.js e o busca.js: a
   regra tem teste, a tela só desenha o que ela devolve. */

(function (raiz) {

    "use strict";

    /* Quanto um produto precisa ter sido buscado para valer anúncio.
       Abaixo disso é ruído: uma busca pode ser o próprio dono
       conferindo se o produto está no site. */
    var BUSCAS_MINIMAS = 3;

    /* Desconto que faz o anúncio ter o que dizer. Abaixo de 10% o
       cliente não percebe, e o anúncio fica sem argumento. */
    var DESCONTO_MINIMO = 10;

    /* Estoque abaixo disto não aguenta uma campanha. Anunciar 2
       unidades é pagar clique para 20 pessoas e vender para duas. */
    var ESTOQUE_MINIMO = 5;

    function semAcento(texto) {
        return String(texto || "")
            .normalize("NFD").replace(/[̀-ͯ]/g, "")
            .toLowerCase().trim();
    }

    /* Ponto é decimal ou milhar conforme a origem, e confundir os dois
       aqui é preço errado no anúncio: um <input type="number"> devolve
       "19.99" (ponto decimal, em qualquer idioma), enquanto um texto
       em formato brasileiro escreve "1.234,56" (ponto de milhar).
       A vírgula é o que distingue os dois. */
    function numero(valor) {

        if (typeof valor === "number") return isFinite(valor) ? valor : 0;

        var texto = String(valor === undefined || valor === null ? "" : valor).trim();
        if (!texto) return 0;

        var n = Number(texto.indexOf(",") >= 0
            ? texto.replace(/\./g, "").replace(",", ".")
            : texto);

        return isFinite(n) ? n : 0;

    }

    /* ------------------------------------------------------------------
       O que NUNCA é sugerido
       ------------------------------------------------------------------
       Duas peneiras, e as duas pelo mesmo motivo prático: anúncio
       reprovado não custa multa amanhã — custa a CONTA SUSPENSA, e com
       ela vão junto as campanhas que estavam certas.

       A primeira é receita. A segunda é mais larga e foi aprendida
       olhando o catálogo de verdade: MEDICAMENTO NENHUM entra aqui,
       nem o de venda livre.

       Por quê: a RDC 96/2008 não proíbe anunciar dipirona, mas exige
       do anúncio coisas que um post de Instagram montado neste painel
       não tem como carregar — a frase de advertência obrigatória, o
       número de registro na ANVISA, o nome do princípio ativo em
       tamanho legível. Sugerir o remédio e deixar o dono montar o
       resto seria entregar a ele uma infração pronta.

       E, na prática, não se perde nada: anúncio de farmácia que vende é
       fralda, dermocosmético, perfumaria, higiene. O remédio quem
       procura já procura. */

    /* A categoria vem do PDV da própria farmácia, e é ela — não um
       campo `tarja` — que diz o que é medicamento: o catálogo publicado
       não traz tarja na maioria das linhas. Quem traduz categoria em
       família é o familias.js, o mesmo que a vitrine usa. Ter duas
       leituras disso em dois lugares é como uma delas fica velha e o
       painel passa a sugerir controlado. */
    function familiaDoProduto(produto) {
        if (typeof raiz.familiaDe !== "function") return null;
        return raiz.familiaDe(produto.categoria || "");
    }

    function ehMedicamento(produto) {
        var familia = familiaDoProduto(produto);
        return !!(familia && familia.medicamento);
    }

    function exigeReceita(produto) {

        var familia = familiaDoProduto(produto);
        var categoria = String(produto.categoria || "").toUpperCase();

        if (raiz.Receita && typeof raiz.Receita.decidirReceita === "function") {

            var decidido = raiz.Receita.decidirReceita(produto, {
                /* As MESMAS opções que a vitrine passa. Sem elas, um
                   Bactrim (categoria "ETICO CONTROLADO", sem tarja no
                   catálogo) passava batido — era o furo que este
                   comentário existe para lembrar. */
                familiaExigeReceita: !!(familia && familia.receita),
                categoriaControlada: categoria === "ETICO CONTROLADO"
            });

            return decidido.bloqueioPresencial
                || decidido.precisaDeReceita
                || decidido.controlado344
                || decidido.confirmarReceita;

        }

        /* Sem o receita.js carregado, recusa pelo que dá para ver. Na
           dúvida, não anuncia: o custo de deixar passar é a conta
           suspensa; o de recusar demais é uma sugestão a menos. */
        var tarja = produto.tarja || "";

        return tarja === "P" || tarja === "V" || tarja === "R"
            || categoria === "ETICO CONTROLADO"
            || !!(familia && familia.receita)
            || produto.bloqueioPresencial === true
            || produto.receitaRemota === true
            || produto.confirmarReceita === true;

    }

    function podeSerAnunciado(produto) {
        return !exigeReceita(produto) && !ehMedicamento(produto);
    }

    function descontoDe(produto) {
        var venda = numero(produto.preco);
        var promo = numero(produto.promo || produto.promoPlanilha);
        if (!venda || !promo || promo >= venda) return 0;
        return Math.round(((venda - promo) / venda) * 100);
    }

    /* A busca casa com o produto quando o termo digitado aparece no
       nome. É grosseiro de propósito: "dipirona" tem de casar com
       "Dipirona Sódica 500mg Com/10", e qualquer coisa mais esperta
       aqui erraria de um jeito difícil de explicar para o dono. */
    function produtoDaBusca(produtos, termo) {

        var alvo = semAcento(termo);
        if (alvo.length < 3) return null;

        var achados = produtos.filter(function (p) {
            return semAcento(p.nome).indexOf(alvo) >= 0;
        });

        if (!achados.length) return null;

        /* Entre os que casam, o de maior estoque: é o que aguenta a
           campanha, e é o mesmo critério que o cliente veria primeiro
           na lista. */
        return achados.sort(function (a, b) {
            return numero(b.estoque) - numero(a.estoque);
        })[0];

    }

    /* Montados aqui e não na tela porque este texto tem regra: nome,
       preço e entrega. Sem promessa de resultado, sem "o melhor", sem
       indicação de uso — é o que a RDC 96/2008 cobra e, de quebra, é o
       que converte. Anúncio de farmácia que tenta ser criativo vira
       anúncio reprovado. */
    function textoDoAnuncio(produto, loja) {

        var nome = produto.nome;
        var preco = produto.promo > 0 && produto.promo < produto.preco
            ? produto.promo : produto.preco;

        var reais = preco.toFixed(2).replace(".", ",");

        var linhas = [nome + " por R$ " + reais + "."];

        if (loja && loja.nome) linhas.push("Na " + loja.nome + ".");

        if (loja && loja.entrega) linhas.push("Entrega em " + loja.entrega + ".");

        linhas.push("Peça pelo link 👇");

        return linhas.join(" ");

    }

    function linkDoAnuncio(produto, loja, campanha) {

        var base = (loja && loja.site) ? String(loja.site).replace(/\/+$/, "") : "";

        /* Busca pelo EAN, e não pelo nome. O índice de busca do site
           inclui o código de barras, então os dois levam ao mesmo
           produto — mas "?busca=7891106002002" cabe numa bio de
           Instagram e "?busca=Fralda%20Pompom%20M%20C%2F40" não. Link
           comprido em anúncio é link que ninguém digita e que o
           WhatsApp quebra na pré-visualização. */
        var caminho = produto.url
            || (produto.ean
                ? "/?busca=" + encodeURIComponent(produto.ean)
                : "/?busca=" + encodeURIComponent(produto.nome));

        var endereco = base + caminho;

        if (!campanha) return endereco;

        return endereco + (endereco.indexOf("?") >= 0 ? "&" : "?")
            + "c=" + encodeURIComponent(campanha);

    }

    /* ------------------------------------------------------------------
       A regra
       ------------------------------------------------------------------
       Devolve o que anunciar e, separado, o que NÃO dá para anunciar
       porque a loja não tem — que é lista de compras, não de anúncio.
       Misturar as duas é o erro que faz a loja anunciar o que vai
       faltar. */
    function sugerir(dados) {

        var d = dados || {};
        var produtos = Array.isArray(d.produtos) ? d.produtos : [];
        var maisProcurados = Array.isArray(d.maisProcurados) ? d.maisProcurados : [];
        var naoEncontrados = Array.isArray(d.naoEncontrados) ? d.naoEncontrados : [];
        var parado = Array.isArray(d.parado) ? d.parado : [];
        var limite = d.limite || 6;
        var loja = d.loja || {};
        var campanha = d.campanha || "";

        /* Quem está acabando sai da lista ANTES de qualquer conta. É a
           regra mais importante deste arquivo: anunciar o que vai
           faltar gasta dinheiro para decepcionar cliente. */
        var acabando = {};

        (d.rompidos || []).concat(d.vaoRomper || []).forEach(function (p) {
            if (p && p.ean) acabando[String(p.ean)] = true;
            if (p && p.codigo) acabando[String(p.codigo)] = true;
        });

        var podeAnunciar = produtos.filter(function (p) {
            if (!p || !p.nome) return false;
            if (!podeSerAnunciado(p)) return false;
            if (numero(p.estoque) < ESTOQUE_MINIMO) return false;
            if (numero(p.preco) <= 0) return false;
            if (acabando[String(p.ean)] || acabando[String(p.codigo)]) return false;
            return true;
        });

        var escolhidos = {};
        var sugestoes = [];

        function juntar(produto, tipo, motivo, forca) {
            if (!produto) return;
            var chave = String(produto.codigo || produto.ean || produto.nome);
            if (escolhidos[chave]) return;
            escolhidos[chave] = true;
            sugestoes.push({
                codigo: produto.codigo, ean: produto.ean, nome: produto.nome,
                preco: numero(produto.preco),
                promo: numero(produto.promo || produto.promoPlanilha),
                estoque: numero(produto.estoque),
                imagem: produto.imagem || "",
                tipo: tipo, motivo: motivo, forca: forca,
                texto: textoDoAnuncio({
                    nome: produto.nome,
                    preco: numero(produto.preco),
                    promo: numero(produto.promo || produto.promoPlanilha)
                }, loja),
                link: linkDoAnuncio(produto, loja, campanha)
            });
        }

        /* 1. O que já procuram aqui dentro.
           É a demanda mais barata que existe: não precisa criar
           vontade, só lembrar que a loja tem. */
        maisProcurados.forEach(function (b) {

            if (!b || numero(b.buscas) < BUSCAS_MINIMAS) return;

            var produto = produtoDaBusca(podeAnunciar, b.termo);
            if (!produto) return;

            juntar(produto, "procurado",
                numero(b.buscas) + " pessoas buscaram \"" + b.termo
                + "\" no site, e você tem " + numero(produto.estoque) + " em estoque",
                1000 + numero(b.buscas));

        });

        /* 2. O que está com desconto de verdade.
           Desconto é o que faz o anúncio ter o que dizer. */
        podeAnunciar.forEach(function (p) {

            var desconto = descontoDe(p);
            if (desconto < DESCONTO_MINIMO) return;

            juntar(p, "oferta",
                "está " + desconto + "% abaixo do preço normal",
                500 + desconto);

        });

        /* 3. O dinheiro parado na prateleira.
           Anunciar o encalhado é a única forma de transformá-lo em
           caixa sem queimar preço no balcão. */
        parado.forEach(function (item) {

            if (!item) return;

            var produto = podeAnunciar.filter(function (p) {
                return String(p.ean) === String(item.ean)
                    || String(p.codigo) === String(item.codigo);
            })[0];

            if (!produto) return;

            juntar(produto, "parado",
                "parado há " + (item.dias_parado || item.dias || "?")
                + " dias, com " + dinheiroCurto(item.dinheiro || item.valor)
                + " na prateleira",
                100 + numero(item.dinheiro || item.valor));

        });

        sugestoes.sort(function (a, b) { return b.forca - a.forca; });

        /* O que procuraram e a loja não tinha. NÃO entra em anúncio —
           é lista de compras. Anunciar o que não se tem é a forma mais
           cara de perder um cliente: ele clica, não acha e aprende que
           o site não serve. */
        var faltando = naoEncontrados
            .filter(function (b) { return b && numero(b.buscas) >= BUSCAS_MINIMAS; })
            .map(function (b) {
                return { termo: b.termo, buscas: numero(b.buscas) };
            });

        return { sugestoes: sugestoes.slice(0, limite), faltando: faltando };

    }

    function dinheiroCurto(valor) {
        return "R$ " + numero(valor).toFixed(2).replace(".", ",");
    }

    raiz.Anunciar = {
        sugerir: sugerir,
        textoDoAnuncio: textoDoAnuncio,
        linkDoAnuncio: linkDoAnuncio,
        exigeReceita: exigeReceita,
        ehMedicamento: ehMedicamento,
        podeSerAnunciado: podeSerAnunciado,
        BUSCAS_MINIMAS: BUSCAS_MINIMAS,
        DESCONTO_MINIMO: DESCONTO_MINIMO,
        ESTOQUE_MINIMO: ESTOQUE_MINIMO
    };

})(typeof globalThis !== "undefined" ? globalThis : window);

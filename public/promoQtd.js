/* As promoções de quantidade: "leve 3 pague 2" e "3 por R$ 10".

   São diferentes de tudo que o site já fazia com preço. A promoção
   comum troca o preço de UMA unidade, e a conta do carrinho continua
   sendo preço × quantidade. Estas mudam a conta: o valor depende de
   QUANTAS a pessoa leva, e muda de novo a cada unidade a mais.

   O MODELO É UM SÓ

   As duas são "a cada N unidades, o pacote custa X":

     leve 3 pague 2  ->  N = 3, X = 2 × preço unitário
     3 por R$ 10     ->  N = 3, X = 10,00

   Quem leva 7 com "3 por 10" paga dois pacotes e uma solta. Não existe
   pacote pela metade: a sobra sai pelo preço normal, que é como a
   farmácia cobra no balcão e como o cliente espera.

   A REGRA QUE IMPEDE O PIOR ERRO

   Oferta que sai mais cara que o preço normal é IGNORADA. Parece
   impossível até o dia em que a planilha é reexportada com preço menor
   e a oferta de "3 por R$ 10" continua no ar com o produto a R$ 2,90 —
   aí o site cobraria R$ 10 por três coisas que valem R$ 8,70, e quem
   confiou na promoção pagou mais caro por causa dela. Entre não ter
   promoção e ter uma que pune, não ter.

   Roda sem navegador e tem teste (teste-promo-qtd.mjs). A tela só
   desenha o que esta conta devolver. */

(function (raiz) {

    "use strict";

    var TIPOS = ["leve-pague", "pacote"];

    /* Ponto é decimal ou milhar conforme a origem, e confundir os dois
       aqui é promoção errada no ar: um <input type="number"> devolve
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

    function inteiro(valor) {
        return Math.max(0, Math.round(numero(valor)));
    }

    function centavos(valor) {
        return Math.round(numero(valor) * 100) / 100;
    }

    /* Quantas unidades fecham um pacote. */
    function tamanhoDoPacote(oferta) {
        if (!oferta) return 0;
        return oferta.tipo === "leve-pague"
            ? inteiro(oferta.leve)
            : inteiro(oferta.quantidade);
    }

    /* Quanto custa um pacote fechado, ao preço unitário de hoje.

       No "leve e pague" o valor acompanha o preço do produto: se a
       planilha reexportar mais barato, o "leve 3 pague 2" fica mais
       barato junto, sozinho. É a forma honesta — a loja prometeu dar
       uma unidade, não um valor. */
    function precoDoPacote(oferta, precoUnitario) {
        if (!oferta) return 0;
        return oferta.tipo === "leve-pague"
            ? centavos(inteiro(oferta.pague) * numero(precoUnitario))
            : centavos(oferta.preco);
    }

    /* A oferta existe, está preenchida e vale a pena para o cliente. */
    function vale(oferta, precoUnitario) {

        if (!oferta || TIPOS.indexOf(oferta.tipo) < 0) return false;

        var pacote = tamanhoDoPacote(oferta);
        var unitario = numero(precoUnitario);

        /* Pacote de 1 não é oferta de quantidade — é preço. Para isso
           existe a promoção comum, e tratá-lo aqui faria o site
           mostrar "leve 1 pague 1" para alguém. */
        if (pacote < 2) return false;
        if (unitario <= 0) return false;

        if (oferta.tipo === "leve-pague") {
            var pague = inteiro(oferta.pague);
            /* Pagar tudo que leva não é promoção, e pagar mais que
               leva é cobrança indevida. */
            if (pague < 1 || pague >= pacote) return false;
        }

        var valorDoPacote = precoDoPacote(oferta, unitario);

        if (valorDoPacote <= 0) return false;

        /* A trava principal: o pacote precisa ser MAIS BARATO que
           comprar as mesmas unidades soltas. */
        return valorDoPacote < centavos(pacote * unitario);

    }

    /* A conta de uma linha do carrinho.

       Devolve sempre um objeto, mesmo sem oferta — assim quem chama
       não precisa saber se existe promoção para decidir como somar. */
    function aplicar(oferta, quantidade, precoUnitario) {

        var qtd = inteiro(quantidade);
        var unitario = numero(precoUnitario);
        var cheio = centavos(qtd * unitario);

        if (!vale(oferta, unitario) || qtd < 1) {
            return {
                temOferta: false, total: cheio, economia: 0,
                pacotes: 0, resto: qtd, faltam: 0
            };
        }

        var pacote = tamanhoDoPacote(oferta);
        var valorDoPacote = precoDoPacote(oferta, unitario);

        var pacotes = Math.floor(qtd / pacote);
        var resto = qtd % pacote;

        var total = centavos(pacotes * valorDoPacote + resto * unitario);

        return {
            temOferta: true,
            total: total,
            economia: centavos(cheio - total),
            pacotes: pacotes,
            resto: resto,
            /* Quantas faltam para fechar o PRÓXIMO pacote. É o número
               que vira "leve mais 1 e pague só 2" na tela — e é o que
               faz a promoção vender, em vez de só existir. */
            faltam: resto === 0 ? 0 : pacote - resto
        };

    }

    function reais(valor) {
        return "R$ " + numero(valor).toFixed(2).replace(".", ",");
    }

    /* O rótulo curto, do jeito que a farmácia escreve na gôndola. */
    function rotulo(oferta, precoUnitario) {

        if (!vale(oferta, precoUnitario)) return "";

        if (oferta.tipo === "leve-pague") {
            return "Leve " + tamanhoDoPacote(oferta)
                 + " pague " + inteiro(oferta.pague);
        }

        return tamanhoDoPacote(oferta) + " por " + reais(oferta.preco);

    }

    /* O empurrão, quando falta pouco. Só aparece quando a pessoa JÁ
       colocou alguma no carrinho: oferecer "leve mais 3" para quem não
       levou nenhuma é anúncio, não ajuda. */
    function convite(oferta, quantidade, precoUnitario) {

        var conta = aplicar(oferta, quantidade, precoUnitario);

        if (!conta.temOferta || !conta.faltam || inteiro(quantidade) < 1) return "";

        var pacote = tamanhoDoPacote(oferta);
        var valorDoPacote = precoDoPacote(oferta, precoUnitario);

        var quanto = conta.faltam === 1
            ? "mais 1"
            : "mais " + conta.faltam;

        if (oferta.tipo === "leve-pague") {
            return "Leve " + quanto + " e pague só " + inteiro(oferta.pague);
        }

        return "Leve " + quanto + " e leve " + pacote + " por " + reais(valorDoPacote);

    }

    /* Valida o que o painel está tentando salvar, com o recado que a
       pessoa precisa ler. Devolve "" quando está tudo certo. */
    function erroDeCadastro(oferta, precoUnitario) {

        if (!oferta || TIPOS.indexOf(oferta.tipo) < 0) return "Escolha o tipo da oferta.";

        var pacote = tamanhoDoPacote(oferta);

        if (pacote < 2) return "A oferta precisa valer a partir de 2 unidades.";

        if (oferta.tipo === "leve-pague") {
            var pague = inteiro(oferta.pague);
            if (pague < 1) return "Quantas o cliente paga?";
            if (pague >= pacote) return "Pagar " + pague + " levando " + pacote + " não é promoção.";
            return "";
        }

        if (numero(oferta.preco) <= 0) return "Quanto custa o pacote?";

        var unitario = numero(precoUnitario);

        /* Só dá para comparar quando se sabe o preço do produto. Sem
           ele a oferta é salva assim mesmo — e o site a ignora
           sozinho, na hora, se ela sair mais cara. */
        if (unitario > 0 && centavos(oferta.preco) >= centavos(pacote * unitario)) {
            return pacote + " por " + reais(oferta.preco) + " fica mais caro que "
                 + pacote + " unidades a " + reais(unitario) + ". O site vai ignorar.";
        }

        return "";

    }

    raiz.PromoQtd = {
        aplicar: aplicar,
        vale: vale,
        rotulo: rotulo,
        convite: convite,
        erroDeCadastro: erroDeCadastro,
        tamanhoDoPacote: tamanhoDoPacote,
        precoDoPacote: precoDoPacote,
        TIPOS: TIPOS
    };

})(typeof globalThis !== "undefined" ? globalThis : window);

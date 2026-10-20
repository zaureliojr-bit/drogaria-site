/* =====================================================================
   Estoque: quantas unidades o cliente pode levar
   =====================================================================

   O catálogo já traz o número de unidades de cada item, e até agora o
   site só fazia uma pergunta de sim ou não: tem ou não tem (o
   semEstoque do script.js). O cliente podia pôr 6 unidades de um
   produto que tem 2 na prateleira, e a conta só aparecia no WhatsApp —
   com a farmacêutica avisando que vai faltar.

   Duas coisas diferentes, e a distinção é o assunto deste arquivo:

     o LIMITE   quantas o carrinho aceita. É o que resolve o problema:
                não dá para pedir o que não existe.

     o NÚMERO   dizer "restam 2" na tela. É informação, e tem um preço:
                o estoque chega de uma extração do PDV que roda UMA VEZ
                por dia, enquanto a loja vende no balcão o dia inteiro.
                Um "restam 2" visto às 18h pode ter sido verdade às 6h
                da manhã.

   Por isso o número só aparece quando é POUCO, que é quando ele muda a
   decisão de quem está comprando ("levo as duas então"). De 6 unidades
   para cima a tela volta a dizer só "disponível": o cliente que ia
   comprar uma caixa não ganha nada sabendo que havia 47, e a loja não
   fica devendo explicação por um número que envelheceu.

   MOSTRAR_ATE é a fronteira entre as duas coisas. O limite vale sempre;
   o número, só abaixo dela.

   Arquivo próprio, como o receita.js, porque é regra que roda sem
   navegador e tem teste (teste-estoque.mjs).
   ===================================================================== */

(function (raiz) {

    /* Até quantas unidades o número aparece na tela.

       Cinco porque é o ponto em que "poucas" ainda é verdade: no
       catálogo publicado hoje a maior parte dos itens tem de 1 a 3
       unidades, e é exatamente dessa faixa que o cliente precisa
       saber. */
    const MOSTRAR_ATE = 5;

    /* Teto de segurança para quem não informou estoque.

       Campo ausente vale como disponível (é a regra do temEstoqueDe, e
       existe para a loja não aparecer esgotada se a coluna sumir da
       exportação). Mas "não sei quantas tem" não é "pode pedir 300" —
       um pedido desse tamanho num site de bairro é dedo escorregando no
       botão, não compra. */
    const TETO_SEM_INFORMACAO = 12;

    /* O estoque chega do FarmaxPDV como número, como "12", como "12,00"
       e às vezes como texto que não é número nenhum. Devolve null
       quando não dá para saber — e null aqui quer dizer "não sei", que
       é diferente de zero. */
    function quantidade(produto) {

        const p = produto || {};
        const bruto = p.estoque;

        if (bruto === undefined || bruto === null || String(bruto).trim() === "") return null;

        const n = Number(String(bruto).replace(",", "."));
        if (isNaN(n)) return null;

        return Math.floor(n);
    }

    /* Quantas unidades o carrinho aceita deste item.

       Produto marcado como esgotado não chega aqui — quem barra é o
       semEstoque, antes. Esta função responde pelo item que ESTÁ à
       venda. */
    function limiteDeCompra(produto) {

        const n = quantidade(produto);

        if (n === null) return TETO_SEM_INFORMACAO;

        /* Encomenda é outro caminho (WhatsApp), e o zerado nem aparece
           com botão de adicionar. Se algum chegar aqui, o limite é 1 em
           vez de 0: travar em zero deixaria um botão que não faz nada,
           que é pior que uma unidade a confirmar no balcão. */
        if (n <= 0) return 1;

        return Math.min(n, TETO_SEM_INFORMACAO);
    }

    /* Cabe mais uma? Resposta única para o card, para a página do
       produto e para a página do carrinho — os três têm botão "+", e
       uma checagem feita em um só deixaria os outros dois passando. */
    function cabeMaisUm(produto, qtdNoCarrinho) {
        return (Number(qtdNoCarrinho) || 0) < limiteDeCompra(produto);
    }

    /* Corta a quantidade salva ao que existe hoje.

       O carrinho fica guardado no aparelho. Quem montou 5 unidades
       ontem, quando havia 5, não pode fechar o pedido hoje com 5 se a
       extração da manhã diz 2. */
    function ajustarQuantidade(produto, qtd) {
        return Math.min(Math.max(Number(qtd) || 0, 0), limiteDeCompra(produto));
    }

    /* A frase da página do produto, onde o cliente decide quantas vai
       levar. É aqui que o número aparece, e só aqui. */
    function rotuloDeDisponibilidade(produto) {

        const n = quantidade(produto);

        if (n !== null && n > 0 && n <= MOSTRAR_ATE) {
            return {
                poucas: true,
                texto: n === 1 ? "Última unidade em estoque" : `Últimas ${n} unidades em estoque`
            };
        }

        return { poucas: false, texto: "Disponível na loja" };
    }

    /* O aviso de quem apertou "+" no limite.

       Diz o número mesmo acima do MOSTRAR_ATE: aqui ele não é enfeite
       de vitrine, é a resposta à pergunta que a pessoa acabou de fazer
       com o dedo. */
    function avisoDeLimite(produto) {

        const limite = limiteDeCompra(produto);
        const n = quantidade(produto);
        const nome = (produto && produto.nome) || "este produto";

        if (n === null || n > limite) {
            return `Para levar mais de ${limite} unidades de ${nome}, fale com a gente pelo WhatsApp.`;
        }

        return limite === 1
            ? `Temos só 1 unidade de ${nome} no momento.`
            : `Temos ${limite} unidades de ${nome} no momento.`;
    }

    raiz.Estoque = {
        MOSTRAR_ATE, TETO_SEM_INFORMACAO,
        quantidade, limiteDeCompra, cabeMaisUm, ajustarQuantidade,
        rotuloDeDisponibilidade, avisoDeLimite
    };

})(typeof globalThis !== "undefined" ? globalThis : window);

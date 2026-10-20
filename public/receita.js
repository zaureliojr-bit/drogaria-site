/* =====================================================================
   Receita: o que o site faz com cada remédio
   =====================================================================

   Três decisões distintas, e confundi-las é o jeito de errar caro:

     bloqueioPresencial  Portaria 344, listas A/B. NÃO entra no carrinho:
                         o cliente vai ao WhatsApp falar com a
                         farmacêutica. Exige dispensação presencial, e
                         isso não é escolha da loja.

     confirmarReceita    retenção de receita. Entra no carrinho, mas o
                         pedido só é enviado depois de o cliente
                         confirmar que vai mandar a foto.

     receitaRemota       só informação: "venda sob prescrição" no card e
                         na página do produto. Vende normalmente.

   Arquivo próprio porque é a parte que roda sem navegador — e porque
   estas três linhas decidem se um remédio controlado sai do site sem
   receita. Decisão dessa natureza merece teste, e teste que roda em
   dois segundos é teste que se roda.
   ===================================================================== */

(function (raiz) {

    /* Tarja livre, ou produto sem tarja nenhuma.

       Venda livre não retém receita, por mais antimicrobiana que seja a
       substância. O padronizador reconhece a substância e marca
       retenção sem olhar a tarja — e foi assim que pastilha de garganta
       (Flogoral, Ciflogex), Canesten e clotrimazol creme passaram a
       travar o carrinho como se fossem antibiótico de prescrição.

       São 59 produtos do catálogo publicado hoje. A regra fica aqui, e
       não só no padronizador, porque corrigir lá sem corrigir aqui
       deixaria o site errado até a próxima publicação. */
    function ehVendaLivre(tarja) {
        return !tarja || tarja === "L";
    }

    /* ---------------------------------------------------------------
       Rede de segurança para a Portaria 344, listas A e B
       ---------------------------------------------------------------

       O bloqueio dependia de marcação POR EAN — tarja vinda do
       tarjas.json e bloqueioPresencial vindo do padronizador. Isso
       falha em silêncio, e falhou:

           Venvanse 30mg   tarja P, bloqueado      ✓
           Venvanse 50mg   sem tarja, no carrinho  ✗
           Venvanse 70mg   sem tarja, no carrinho  ✗

       Mesmo medicamento, três apresentações, uma reconhecida. E não era
       só ele: Rivotril, Gardenal e Urbanil — todos lista B1 — estavam
       igualmente soltos.

       Então o nome do produto passa a valer como segunda fonte. Duas
       pistas, nenhuma dependente de cadastro externo:

         1. a própria lista escrita na descrição ("... Gel A3"), que o
            PDV da farmácia já traz em parte do cadastro;
         2. o nome da substância ou da marca.

       A lista abaixo é de listas A e B — as que exigem Notificação de
       Receita e dispensação presencial. Ela é, por construção,
       incompleta: é rede, não é a fonte. Quando o padronizador marcar
       direito, ela deixa de pegar nada, e tudo bem — rede que nunca
       pega nada é rede que está sobrando, não rede que está errada.

       Errar para o lado de bloquear aqui custa uma venda que vai para
       o WhatsApp. Errar para o outro lado é despachar psicotrópico sem
       dispensação presencial. */

    const LISTA_NA_DESCRICAO = /(^|[^A-Za-z0-9])(A1|A2|A3|B1|B2)([^A-Za-z0-9]|$)/i;

    const SUBSTANCIAS_AB = [
        /* A1/A2 — entorpecentes */
        "morfina", "metadona", "fentanil", "oxicodona", "petidina", "dolantina",
        "dimorf", "durogesic", "targin", "codein",
        /* A3 — psicoestimulantes */
        "lisdexanfetamina", "venvanse", "metilfenidato", "ritalina", "concerta",
        "anfepramona", "femproporex", "mazindol",
        /* B1 — psicotrópicos */
        "clonazepam", "rivotril", "alprazolam", "frontal", "diazepam",
        "bromazepam", "lexotan", "lorazepam", "midazolam", "dormonid",
        "zolpidem", "stilnox", "zopiclona", "flunitrazepam",
        "clobazam", "urbanil", "frisium", "fenobarbital", "gardenal",
        "nitrazepam", "cloxazolam", "olcadil", "estazolam", "triazolam",
        "clordiazepoxido", "lormetazepam",
        /* B2 — anorexígenos */
        "sibutramina"
    ];

    function semAcento(texto) {
        return String(texto || "")
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    }

    function nomeIndicaControlado(descricao) {

        const texto = String(descricao || "");

        if (LISTA_NA_DESCRICAO.test(texto)) return true;

        const limpo = semAcento(texto);

        return SUBSTANCIAS_AB.some(function (s) { return limpo.indexOf(s) >= 0; });

    }

    /* `trava` é o interruptor da retenção. Desligado, o pedido fecha sem
       pedir a foto da receita, e a farmácia assume conferir no balcão e
       na entrega.

       O bloqueio presencial NÃO depende dele: desligar a retenção não
       pode soltar as listas A/B por tabela. São dois assuntos. */
    function decidirReceita(produto, opcoes) {

        const p = produto || {};
        const op = opcoes || {};

        const trava = op.trava !== false;
        const tarja = p.tarja || "";

        /* Tarja preta é rede de segurança: o padronizador só marca
           bloqueioPresencial quando reconhece a substância, e quando o
           cruzamento com a CMED falha um Dimorf passaria batido. */
        const bloqueioPresencial =
            p.bloqueioPresencial === true ||
            tarja === "P" ||
            nomeIndicaControlado(p.descricao);

        const precisaDeReceita = !bloqueioPresencial && (
            p.receitaRemota === true ||
            op.familiaExigeReceita === true ||
            tarja === "V" || tarja === "R"
        );

        /* O fallback existe porque isto é controle sanitário, não
           preferência de interface: enquanto o catálogo publicado não
           trouxer o campo, vale o critério antigo. Não pode haver uma
           janela em que o site simplesmente pare de pedir a receita. */
        const marcadoNoCatalogo = op.catalogoMarcaConfirmar
            ? p.confirmarReceita === true && !bloqueioPresencial
            : precisaDeReceita;

        /* Controlado da Portaria 344 que NÃO é lista A/B — as listas C,
           que a loja vende pelo site com a receita conferida antes do
           despacho.

           Para esses a confirmação da receita continua valendo mesmo
           com a trava desligada, e isso é deliberado: a trava foi
           desligada por causa de pastilha de garganta e antibiótico
           comum travando o carrinho. Desligá-la para antidepressivo e
           anticonvulsivante junto seria despachar controlado sem
           nenhum passo de receita — o que ninguém pediu. */
        const controlado344 = !bloqueioPresencial && (
            p.receitaRemota === true || op.categoriaControlada === true
        );

        return {
            bloqueioPresencial,
            precisaDeReceita,
            controlado344,
            confirmarReceita: !bloqueioPresencial && !ehVendaLivre(tarja) && (
                controlado344 || (trava && marcadoNoCatalogo)
            )
        };

    }

    raiz.Receita = { ehVendaLivre, decidirReceita };

})(typeof globalThis !== "undefined" ? globalThis : window);

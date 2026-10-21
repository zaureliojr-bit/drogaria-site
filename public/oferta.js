/* =====================================================
   Landing page — Drogaria Mais Barato
   =====================================================

   Página de chegada: é para onde o anúncio manda quem ainda não conhece
   a loja. Ela responde três perguntas em ordem — dá para entregar aqui?
   o preço é bom mesmo? isso é farmácia de verdade? — e oferece dois
   caminhos, WhatsApp ou catálogo.

   Reaproveita o script.js inteiro em vez de ter lógica própria. Isso
   significa que as ofertas aqui vêm do mesmo produtos.json da loja, com
   o mesmo tratamento de tarja, estoque e receita. Uma landing com preço
   diferente do catálogo é pior do que landing nenhuma.
   ===================================================== */

(() => {

  const QUANTAS_OFERTAS = 8;
  const DESCONTO_MINIMO = 10;   // abaixo disso não é oferta, é arredondamento

  /* Teto, e ele existe por um motivo sério.

     Ordenar por maior desconto traz para cá justamente os números que
     não se sustentam: clopidogrel "de R$ 194,20 por R$ 24,99", anlodipino
     "de R$ 49,53 por R$ 6,99". R$ 6,99 é o preço normal de um anlodipino
     genérico — o que está no precoVenda parece ser o preço de referência
     da marca, não um preço que esta loja praticava.

     Na vitrine isso já é discutível. Numa página feita para receber
     anúncio pago, anunciar 87% de desconto no que é preço corrente vira
     publicidade enganosa (CDC art. 37), e medicamento ainda tem a RDC
     96/2008 por cima. O risco não é a multa: é o cliente conferir em
     outra farmácia, ver o mesmo preço e concluir que a loja mente.

     São 44 produtos acima de 70% no catálogo de hoje. Ficam de fora
     DESTA página até alguém da loja confirmar que o "de" é real.

     A vitrine passou a seguir o mesmo critério, por um motivo que só
     apareceu quando a home foi olhada de verdade: o carrossel de
     ofertas ordena por maior desconto, então esses produtos ocupavam
     as primeiras posições da primeira tela do site. Lá eles continuam
     à venda e com o mesmo preço — o que some é a comparação. */
  /* O número mora no script.js agora (DESCONTO_IMPLAUSIVEL): a vitrine
     passou a aplicar o mesmo critério, e duas cópias do mesmo 70
     divergiriam no dia em que uma fosse ajustada. O fallback é para o
     caso de esta página carregar sem o script.js. */
  const DESCONTO_MAXIMO = typeof DESCONTO_IMPLAUSIVEL === "number" ? DESCONTO_IMPLAUSIVEL : 70;

  /* ---------- horário, escrito do jeito que se fala ---------- */
  function escreverHorario() {
    /* Quem sabe o horário é o loja.js, que lê da tabela `lojas_horario`
       e usa o relógio da loja. O cálculo que estava aqui era uma segunda
       cópia das mesmas quatro horas, e duas cópias divergem. */
    const domingo = new Date().getDay() === 0;
    const aberto = typeof lojaAbertaAgora === "function"
      ? lojaAbertaAgora()
      : (() => {
          const agora = new Date();
          const minutos = agora.getHours() * 60 + agora.getMinutes();
          return minutos >= (domingo ? 8 * 60 : 7 * 60)
              && minutos <  (domingo ? 19 * 60 + 30 : 21 * 60 + 30);
        })();

    const selo = document.getElementById("lpStatus");
    if (selo) {
      selo.textContent = aberto
        ? "Aberto agora · São Bernardo do Campo"
        : "São Bernardo do Campo";
      selo.classList.toggle("lp-selo-aberto", aberto);
    }

    const linha = document.getElementById("lpHorario");
    if (!linha) return;

    /* Fechado, a promessa de duas horas não vale — e prometer o que não
       se cumpre custa mais caro do que não prometer. Então a frase muda:
       o pedido pode ser feito agora e sai quando a loja abrir. */
    /* "Abrimos às 7h" sai do horário cadastrado, e não de um texto
       fixo: a frase precisa mudar junto com a tabela, senão a loja
       muda de horário e o site segue prometendo o antigo. */
    const abertura = typeof proximaAberturaDeHoje === "function"
      ? proximaAberturaDeHoje()
      : (domingo ? "8h" : "7h");

    linha.textContent = aberto
      ? "Aberto agora. Pedidos feitos até as 20h saem no mesmo dia."
      : abertura
        ? `Fechado agora. Abrimos às ${abertura} — pode deixar o pedido pronto.`
        : "Fechado agora — pode deixar o pedido pronto.";
  }

  /* ---------- ofertas reais ---------- */
  function pintarOfertas() {
    const caixa = document.getElementById("lpOfertas");
    if (!caixa || typeof produtos === "undefined") return;

    /* Sem estoque não entra — não adianta atrair com o que não dá para
       levar.

       E medicamento sob prescrição não entra, o que é o corte mais
       importante desta página. A RDC 96/2008 proíbe anunciar ao público
       medicamento de venda sob prescrição: tarja vermelha só pode ser
       divulgada a profissional de saúde. A vitrine do site pode
       mostrá-los, porque ali é catálogo de quem já entrou na loja; esta
       página existe para receber anúncio, e anúncio é publicidade.

       Sobram 245 produtos no catálogo de hoje para as 8 vagas —
       antialérgico isento, vitamina, dipirona em gotas. Que é também o
       que uma drogaria anunciaria de qualquer jeito.

       São três campos e não um porque eles não se sobrepõem: a nistatina
       de uma pomada, por exemplo, chega sem tarja nenhuma da CMED e mesmo
       assim é antimicrobiano — quem a marca é o confirmarReceita. Filtrar
       só por tarja deixaria ela passar, e foi o que aconteceu na primeira
       tentativa. */
    const ofertas = produtos
      .filter(p =>
        p.emOferta &&
        p.desconto >= DESCONTO_MINIMO &&
        p.desconto <= DESCONTO_MAXIMO &&
        !p.exigeReceita &&
        !p.receitaRemota &&
        !p.confirmarReceita &&
        (!p.tarja || p.tarja === "L") &&
        !semEstoque(p))
      .sort((a, b) => b.desconto - a.desconto)
      .slice(0, QUANTAS_OFERTAS);

    if (!ofertas.length) {
      // sem oferta hoje, a seção inteira sai: uma vitrine vazia numa
      // landing diz "loja parada", que é o contrário do que ela vende
      caixa.closest(".lp-secao")?.remove();
      return;
    }

    caixa.innerHTML = ofertas.map(p => cardHTML(p)).join("");
  }

  function pintarCategorias() {
    const caixa = document.getElementById("lpCategorias");
    if (!caixa || typeof familiasComProdutos !== "function") return;

    /* "Exigem receita" sai daqui. É a família ETICO CONTROLADO, que o
       site não vende (BLOQUEAR_CONTROLADOS), então oferecê-la a quem
       acabou de chegar de um anúncio é mandar a pessoa para um beco:
       ela clica, vê os produtos e descobre que nenhum entra no carrinho. */
    const familias = familiasComProdutos()
      .filter(f => !f.receita)
      .slice(0, 8);
    if (!familias.length) { caixa.closest(".lp-secao")?.remove(); return; }

    caixa.innerHTML = familias.map(f => `
      <a class="lp-categoria" href="/?familia=${encodeURIComponent(f.id)}">
        ${esc(f.nome)}
      </a>
    `).join("");
  }

  document.addEventListener("produtosProntos", (ev) => {
    if (!ev.detail || !ev.detail.ok) {
      /* Catálogo fora do ar não pode derrubar a landing: o WhatsApp
         continua sendo um pedido válido, e é ele que paga o anúncio. */
      document.getElementById("lpOfertas")?.closest(".lp-secao")?.remove();
      document.getElementById("lpCategorias")?.closest(".lp-secao")?.remove();
      return;
    }
    pintarOfertas();
    pintarCategorias();
  });

  escreverHorario();
  setInterval(escreverHorario, 60000);

  /* O horário cadastrado chega depois da primeira pintura — a API é uma
     ida à rede. Sem isto, a frase ficaria com o horário padrão até o
     próximo minuto cheio. */
  document.addEventListener("lojaPronta", escreverHorario);

})();

/* =====================================================
   Página do carrinho — Drogaria Mais Barato
   =====================================================

   Este arquivo é pequeno de propósito. Toda a lógica de carrinho, frete,
   CEP, receita e envio do pedido continua no script.js, que esta página
   também carrega — as funções lá dentro já testam se cada elemento
   existe antes de mexer nele, então mudá-las de lugar no HTML não quebra
   nada. Duplicar essa lógica aqui seria criar um segundo checkout para
   manter em sincronia com o primeiro, e é assim que um dos dois fica
   velho sem ninguém notar.

   O que sobra para cá é só o que é específico da página: decidir quando
   mostrar o conteúdo, e o que fazer quando o catálogo não carrega.
   ===================================================== */

(() => {

  const conteudo = () => document.getElementById("carrinhoConteudo");
  const carregando = () => document.getElementById("carregandoCarrinho");

  function mostrarConteudo() {
    const box = carregando();
    if (box) box.hidden = true;
    const alvo = conteudo();
    if (alvo) alvo.hidden = false;
  }

  /* Sem catálogo não dá para conferir preço nem saber quais itens exigem
     receita. Em vez de mostrar um formulário que vai recusar o pedido lá
     na frente — ou, pior, aceitar um antibiótico sem pedir a receita —,
     a página assume o erro aqui e oferece tentar de novo. */
  function mostrarFalha() {
    const box = carregando();
    if (!box) return;

    box.hidden = false;
    box.innerHTML = `
      <div class="aviso-vazio">
        <p>Não foi possível carregar o catálogo.</p>
        <p class="aviso-vazio-sub">
          Seus itens continuam guardados. Confira a conexão e tente de novo.
        </p>
        <button class="btn-buscar" type="button" data-acao="recarregar">Tentar novamente</button>
      </div>
    `;

    const alvo = conteudo();
    if (alvo) alvo.hidden = true;
  }

  /* O script.js dispara este evento no fim do carregar(), nos dois
     desfechos. É o sinal de que produtos[] está populado e de que o
     reconciliarCarrinho() já ajustou preço e tirou o que saiu de linha —
     antes disso, qualquer número na tela seria provisório. */
  document.addEventListener("produtosProntos", (ev) => {
    if (ev.detail && ev.detail.ok) mostrarConteudo();
    else mostrarFalha();
  });

  /* Rede de segurança: se por algum motivo o evento não vier (erro de
     sintaxe no script.js, por exemplo), a página não pode ficar presa
     para sempre no "Conferindo preços". Depois de 12 segundos, mostra o
     que dá para mostrar — o carrinho vem do localStorage e não depende
     do catálogo para aparecer. */
  setTimeout(() => {
    const box = carregando();
    if (box && !box.hidden && !box.querySelector(".aviso-vazio")) mostrarConteudo();
  }, 12000);

  /* A barra fixa da vitrine mostra o total; aqui o cabeçalho já mostra, e
     a barra duplicaria a informação em cima do botão de finalizar. */
  document.body.classList.add("sem-barra-carrinho");

})();

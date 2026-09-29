/* =====================================================
   Encarte de promoções — Drogaria Mais Barato
   =====================================================

   Mostra o encarte que a loja publicou pelo painel: as páginas em
   imagem, na ordem, e o PDF como opção de baixar.

   Imagem primeiro e PDF depois, e não o contrário, porque PDF no
   celular abre no visualizador de arquivo do sistema — sai do site,
   demora, e metade das pessoas desiste ali. Imagem rola na própria
   página, do jeito que se folheia um encarte de papel.
   ===================================================== */

(() => {

  const el = (id) => document.getElementById(id);

  function mostrarVazio() {
    el("encarteCarregando").hidden = true;
    el("encarteVazio").hidden = false;
  }

  function pintar(encarte) {
    el("encarteTitulo").textContent = encarte.titulo || "Encarte de promoções";

    if (encarte.pdf) {
      const link = el("encartePdf");
      link.href = encarte.pdf;
      link.hidden = false;
    }

    /* A primeira página carrega logo e as outras só quando chegam perto:
       encarte de oito páginas em imagem grande são vários megabytes, e
       baixar tudo de uma vez faz a página demorar a abrir justamente no
       celular, que é onde ela vai ser aberta. */
    el("encartePaginas").innerHTML = encarte.paginas.map((url, i) => `
      <figure class="encarte-pagina">
        <img src="${url.replace(/"/g, "&quot;")}"
             alt="Página ${i + 1} do encarte"
             loading="${i === 0 ? "eager" : "lazy"}"
             decoding="async">
        <figcaption>Página ${i + 1} de ${encarte.paginas.length}</figcaption>
      </figure>
    `).join("");

    el("encarteCarregando").hidden = true;
    el("encarteConteudo").hidden = false;
  }

  async function carregar() {
    if (typeof API_PEDIDOS_D1 === "undefined" || !API_PEDIDOS_D1) return mostrarVazio();

    try {
      const resposta = await fetch(`${API_PEDIDOS_D1.replace(/\/+$/, "")}/encarte`, { cache: "no-cache" });
      if (!resposta.ok) throw new Error("HTTP " + resposta.status);

      const { encarte } = await resposta.json();

      if (!encarte || !encarte.paginas || !encarte.paginas.length) return mostrarVazio();

      pintar(encarte);

    } catch (e) {
      /* Sem encarte a loja continua vendendo. A tela de "não há encarte"
         com o caminho de volta para a vitrine é melhor do que uma tela
         de erro, que só diz ao cliente que algo está quebrado sem
         oferecer o que fazer. */
      console.info("Encarte indisponível.", e);
      mostrarVazio();
    }
  }

  document.addEventListener("DOMContentLoaded", carregar);

})();

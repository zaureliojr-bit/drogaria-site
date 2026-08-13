/* =========================
📄 PÁGINA DE PRODUTO
Depende do script.js: produtos, carrinho, el, esc, icone, fmt,
precoGrandeHTML, mais, menos, toast, falarSobreReceita, cardMiniHTML,
BLOQUEAR_CONTROLADOS.
========================= */

// espera o script.js terminar de carregar os produtos (sucesso ou erro),
// via evento (rápido) com um poll de segurança por trás (rede lenta)
function aguardarProdutos() {
  return new Promise(resolve => {
    if (typeof produtos !== "undefined" && produtos.length) {
      return resolve({ ok: true });
    }

    let resolvido = false;
    const finalizar = ok => {
      if (resolvido) return;
      resolvido = true;
      clearInterval(iv);
      clearTimeout(seguranca);
      document.removeEventListener("produtosProntos", onEvento);
      resolve({ ok });
    };

    const onEvento = e => finalizar(!!(e.detail && e.detail.ok) && produtos.length > 0);
    document.addEventListener("produtosProntos", onEvento);

    // poll de apoio, caso o evento dispare antes deste script carregar
    const iv = setInterval(() => {
      if (typeof produtos !== "undefined" && produtos.length) finalizar(true);
    }, 150);

    // segurança: em redes bem lentas, não trava pra sempre — mas
    // isso vira mensagem de "erro de conexão", não "produto não encontrado"
    const seguranca = setTimeout(
      () => finalizar(typeof produtos !== "undefined" && produtos.length > 0),
      20000
    );
  });
}

// interpreta o campo "estoque" (pode vir como número, "S"/"N", etc.)
// retorna true, false, ou null (quando não há essa informação no cadastro)
function estoqueStatus(estoque) {
  if (estoque === undefined || estoque === null || String(estoque).trim() === "") return null;

  const n = Number(String(estoque).replace(",", "."));
  if (!isNaN(n)) return n > 0;

  const s = String(estoque).trim().toUpperCase();
  if (["N", "NAO", "NÃO", "0", "FALSE", "INDISPONIVEL"].includes(s)) return false;
  if (["S", "SIM", "1", "TRUE", "DISPONIVEL"].includes(s)) return true;

  return null;
}

function mostrarSkeletonProduto() {
  const container = el("produtoDetalhe");
  if (!container) return;

  container.classList.add("skeleton");
  container.innerHTML = `
    <div class="produto-detalhe-foto"></div>
    <div class="skeleton-linha curta"></div>
    <div class="skeleton-linha" style="width:80%; height:22px;"></div>
    <div class="skeleton-linha" style="width:50%;"></div>
  `;
}

function mostrarErroConexao() {
  const container = el("produtoDetalhe");
  if (!container) return;

  container.classList.remove("skeleton");
  container.innerHTML = `
    <div class="produto-detalhe-erro">
      <p class="erro-titulo">Não foi possível carregar os produtos.</p>
      <p>Confira sua conexão e tente de novo.</p>
      <p class="erro-acoes">
        <button class="btn-buscar" onclick="window.location.reload()">Tentar novamente</button>
      </p>
      <p><a href="index.html">Voltar para a loja</a></p>
    </div>
  `;
}

function mostrarProdutoNaoEncontrado() {
  const container = el("produtoDetalhe");
  if (!container) return;

  container.classList.remove("skeleton");
  container.innerHTML = `
    <div class="produto-detalhe-erro">
      <p class="erro-titulo">Produto não encontrado.</p>
      <p>Ele pode ter saído do catálogo ou o link está incorreto.</p>
      <p class="erro-acoes"><a href="index.html">Voltar para a loja</a></p>
    </div>
  `;
}

function renderProdutoDetalhe(p) {
  document.title = `${p.nome} — Drogaria Mais Barato`;

  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute("content", `${p.nome} por ${fmt(p.preco)} na Drogaria Mais Barato.`);

  const container = el("produtoDetalhe");
  if (!container) return;
  container.classList.remove("skeleton");

  const qtd = (typeof carrinho !== "undefined" ? carrinho : [])
    .find(i => String(i.codigo) === String(p.codigo))?.qtd || 0;

  const emEstoque = estoqueStatus(p.estoque);
  const marcaOuLab = p.marca || p.laboratorio || "";
  const codigo = esc(p.codigo);
  const nome = esc(p.nome);
  const bloqueado = typeof BLOQUEAR_CONTROLADOS !== "undefined" && BLOQUEAR_CONTROLADOS && p.exigeReceita;

  container.dataset.codigo = p.codigo;

  const selo = p.exigeReceita
    ? `<span class="badge-receita">${icone("receita", 12)}Exige receita</span>`
    : p.emOferta
      ? `<span class="badge-oferta">${icone("tag", 12)}-${p.desconto}%</span>`
      : "";

  container.innerHTML = `
    <nav class="migalhas" aria-label="Você está em">
      <a href="index.html">Início</a>
      ${icone("chevron-right", 11)}
      <span>${esc(p.familiaNome || "Produto")}</span>
    </nav>

    <div class="produto-detalhe-foto">
      ${selo}
      <img src="${esc(imagemDe(p))}"
           onerror="this.onerror=null;this.src='${esc(svgDe(p))}'"
           alt="${nome}">
    </div>

    ${marcaOuLab ? `<span class="produto-marca">${esc(marcaOuLab)}</span>` : ""}
    <h1 class="produto-nome">${nome}</h1>

    <div class="produto-preco-box">
      ${p.emOferta ? `
        <div class="preco-linha-de">
          <span class="preco-de">${fmt(p.precoOriginal)}</span>
          <span class="chip-desconto">-${p.desconto}%</span>
        </div>
        <span class="preco preco-por preco-detalhe">${precoGrandeHTML(p.preco)}</span>
      ` : `
        <span class="preco preco-detalhe">${precoGrandeHTML(p.preco)}</span>
      `}
    </div>

    ${emEstoque !== null ? `
      <div class="produto-estoque ${emEstoque ? "disponivel" : "indisponivel"}">
        <span class="ponto"></span> ${emEstoque ? "Disponível na loja" : "Indisponível no momento"}
      </div>` : ""}

    ${bloqueado ? `
      <div class="aviso-receita">
        ${p.tarja === "P" ? `
          <p><strong>Medicamento de tarja preta.</strong></p>
          <p>A venda é controlada pela Portaria 344: exige receita própria, que fica retida na farmácia, e a retirada é presencial, com documento. Não fazemos entrega deste item.</p>
        ` : `
          <p><strong>Este medicamento exige receita.</strong></p>
          <p>Fale com a nossa farmacêutica pelo WhatsApp para conferir disponibilidade e combinar a retirada com a receita em mãos.</p>
        `}
      </div>
      <button class="btn-comprar btn-receita-grande" data-acao="receita" data-codigo="${codigo}">
        ${icone("whats", 16)}Falar com a farmacêutica
      </button>
    ` : `
      <div class="controle controle-detalhe">
        <button data-acao="menos" data-codigo="${codigo}" aria-label="Remover uma unidade">−</button>
        <span aria-live="polite">${qtd}</span>
        <button data-acao="mais" data-codigo="${codigo}" aria-label="Adicionar uma unidade">+</button>
      </div>

      <button class="btn-comprar" data-acao="comprar" data-codigo="${codigo}">
        ${icone("cart", 15)}Adicionar ao carrinho
      </button>
    `}

    <div class="produto-meta">
      ${p.tarjaNome ? `<span>${esc(p.tarjaNome)}</span>` : ""}
      ${p.ean ? `<span>EAN ${esc(p.ean)}</span>` : ""}
      <span>Cód. ${codigo}</span>
    </div>

    <p class="produto-aviso-legal">
      Este site não substitui orientação médica. Não pratique automedicação.
    </p>
  `;

  renderRelacionados(p);
}

/* mais produtos da mesma família, para o cliente não cair num beco sem saída */
function renderRelacionados(p) {
  const box = el("relacionados");
  if (!box || typeof produtos === "undefined") return;

  const lista = produtos
    .filter(x => x.familia === p.familia && String(x.codigo) !== String(p.codigo))
    .slice(0, 12);

  if (!lista.length) { box.style.display = "none"; return; }

  box.style.display = "";
  box.innerHTML = `
    <h2>Mais de ${esc(p.familiaNome || "produtos")}</h2>
    <div class="scroll-horizontal">${lista.map(cardMiniHTML).join("")}</div>
  `;
}

function adicionarAoCarrinhoDetalhe(codigo) {
  const p = produtos.find(i => String(i.codigo) === String(codigo));
  mais(codigo);
  if (p && !(typeof BLOQUEAR_CONTROLADOS !== "undefined" && BLOQUEAR_CONTROLADOS && p.exigeReceita)) {
    toast(`${p.nome} adicionado`);
  }
}

/* a delegação do script.js cobre mais/menos/receita; aqui só o "comprar" */
document.addEventListener("click", ev => {
  const alvo = ev.target.closest('[data-acao="comprar"]');
  if (!alvo) return;
  ev.preventDefault();
  adicionarAoCarrinhoDetalhe(alvo.dataset.codigo);
});

async function initProdutoPage() {
  mostrarSkeletonProduto();
  const { ok } = await aguardarProdutos();

  if (!ok || typeof produtos === "undefined" || !produtos.length) {
    mostrarErroConexao();
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const codigo = params.get("codigo");

  const produto = produtos.find(p => String(p.codigo) === String(codigo));

  if (!produto) {
    mostrarProdutoNaoEncontrado();
    return;
  }

  renderProdutoDetalhe(produto);
}

document.addEventListener("DOMContentLoaded", initProdutoPage);

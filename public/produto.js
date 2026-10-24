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
      <p><a href="/">Voltar para a loja</a></p>
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
      <p class="erro-acoes"><a href="/">Voltar para a loja</a></p>
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

  // p.temEstoque e p.encomenda vêm prontos do mapearProduto (script.js):
  // a grade e esta página precisam responder a mesma coisa sobre o mesmo
  // item, e antes cada uma tinha a sua interpretação do campo.
  const emEstoque = !semEstoque(p);
  const disponibilidade = Estoque.rotuloDeDisponibilidade(p);
  const marcaOuLab = p.marca || p.laboratorio || "";
  const codigo = esc(p.codigo);
  const nome = esc(p.nome);
  const bloqueado = typeof BLOQUEAR_CONTROLADOS !== "undefined" && BLOQUEAR_CONTROLADOS && p.exigeReceita;

  container.dataset.codigo = p.codigo;

  // Mesmo critério da tira do card: o selo sobre a foto é para quem tem um
  // passo a mais a cumprir. A tarja vermelha comum não entra — ela é
  // explicada logo abaixo, no aviso, com espaço para dizer que vende
  // normalmente pelo site.
  const selo = p.exigeReceita
    ? `<span class="badge-receita">${icone("receita", 12)}Retém receita</span>`
    : p.confirmarReceita
      ? `<span class="badge-controle">${icone("receita", 12)}Envie a receita</span>`
      : p.emOferta && !p.descontoSuspeito
        ? `<span class="badge-oferta">${icone("tag", 12)}-${p.desconto}%</span>`
        : "";

  container.innerHTML = `
    <nav class="migalhas" aria-label="Você está em">
      <a href="/">Início</a>
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
      ${p.emOferta && !p.descontoSuspeito ? `
        <div class="preco-linha-de">
          <span class="preco-de">${fmt(p.precoOriginal)}</span>
          <span class="chip-desconto">-${p.desconto}%</span>
        </div>
        <span class="preco preco-por preco-detalhe">${precoGrandeHTML(p.preco)}</span>
      ` : `
        <span class="preco preco-detalhe">${precoGrandeHTML(p.preco)}</span>
      `}

      <!-- A oferta de quantidade, onde o cliente decide quantas vai
           levar. É a tela mais importante para ela: no card há espaço
           para o rótulo, mas é aqui que a pessoa escolhe o número. -->
      ${PromoQtd.rotulo(p.ofertaQtd, p.preco) ? `
        <div class="produto-oferta-qtd">
          <strong>${esc(PromoQtd.rotulo(p.ofertaQtd, p.preco))}</strong>
          <span>levando ${PromoQtd.tamanhoDoPacote(p.ofertaQtd)},
                sai por ${fmt(PromoQtd.precoDoPacote(p.ofertaQtd, p.preco)
                              / PromoQtd.tamanhoDoPacote(p.ofertaQtd))} cada</span>
        </div>
      ` : ""}
    </div>

    <!-- É aqui, e só aqui, que o número de unidades aparece: esta é a
         tela em que o cliente decide quantas vai levar.

         E só quando é pouco. O estoque vem de uma extração do PDV que
         roda uma vez por dia, enquanto a loja vende no balcão o dia
         inteiro — um "restam 2" visto às 18h pode ter sido verdade às
         6h da manhã. Abaixo de meia dúzia esse número muda a decisão de
         quem compra ("levo as duas, então"); acima dela só envelhece na
         tela sem servir para nada. Quem decide a fronteira é o
         Estoque.MOSTRAR_ATE. -->
    <div class="produto-estoque ${emEstoque ? (disponibilidade.poucas ? "disponivel poucas" : "disponivel") : "indisponivel"}">
      <span class="ponto"></span> ${emEstoque ? esc(disponibilidade.texto) : "Indisponível no momento"}
    </div>

    ${!emEstoque ? `

      ${p.encomenda ? `
        <div class="aviso-encomenda">
          <p><strong>Não temos em estoque agora.</strong></p>
          <p>Este é um item que conseguimos trazer sob encomenda. Fale com a
             gente pelo WhatsApp que verificamos prazo e preço com o
             distribuidor.</p>
        </div>
        <button class="btn-comprar btn-encomendar-grande" data-acao="encomendar" data-codigo="${codigo}">
          ${icone("whats", 16)}Encomendar pelo WhatsApp
        </button>
      ` : `
        <div class="aviso-encomenda">
          <p><strong>Produto indisponível.</strong></p>
          <p>Não estamos trabalhando com este item no momento. Se precisar de
             algo parecido, fale com a nossa farmacêutica.</p>
        </div>
        <button class="btn-comprar btn-receita-grande" data-acao="receita" data-codigo="${codigo}">
          ${icone("whats", 16)}Falar com a farmacêutica
        </button>
      `}

    ` : bloqueado ? `
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
      ${p.confirmarReceita ? `
        <div class="aviso-receita">
          <p><strong>Compre pelo site normalmente.</strong></p>
          <p>Este medicamento tem a receita retida na entrega. Ao finalizar o pedido você confirma que vai enviar a foto dela, e a farmacêutica combina o resto pelo WhatsApp.</p>
        </div>
      ` : p.receitaRemota ? `
        <div class="aviso-receita aviso-receita-leve">
          <p><strong>Compre pelo site normalmente.</strong></p>
          <p>É um medicamento de venda sob prescrição médica: basta ter a receita em mãos na hora de receber, para a farmacêutica conferir. Ela é devolvida na hora.</p>
        </div>
      ` : ""}

      <div id="acoesDetalhe">${acoesDoDetalheHTML(p, qtd)}</div>
    `}

    ${fichaTecnicaHTML(p)}

    <!-- O código interno saiu daqui. Ele é da loja, não do cliente: serve
         para a farmacêutica achar o item na prateleira e para casar o
         pedido com a planilha do PDV. Na tela só ocupava espaço e dava
         ao cliente um número que ele não sabe para que serve.

         Continua indo inteiro no pedido, na mensagem do WhatsApp e no
         histórico gravado no painel. O que a pessoa precisa para
         identificar o produto é o código de barras, e esse está na ficha
         técnica acima. -->
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

  // a barra de rolagem desenhada vem do script.js, e só faz sentido
  // depois que os cards existem no DOM
  if (typeof ligarBarrasDosCarrosseis === "function") ligarBarrasDosCarrosseis(box);
}

function adicionarAoCarrinhoDetalhe(codigo) {
  const p = produtos.find(i => String(i.codigo) === String(codigo));

  /* Só anuncia o que entrou. O mais() devolve se o item foi aceito e já
     explica por que não — esgotado, limite do estoque, receita. Dois
     avisos seguidos deixariam o último, "adicionado", como a última
     palavra sobre um produto que não entrou no carrinho. */
  if (mais(codigo) && p) toast(`${p.nome} adicionado`);
}

/* O que o cliente chama de "genérico ou de marca".

   Sai da categoria do PDV, que é onde a loja já classifica. "GENER/
   SIMILAR S/GT" é a categoria que a farmácia usa quando o item é
   genérico OU similar e ela não separou — então o site diz as duas, em
   vez de escolher uma e errar metade das vezes. */
const TIPO_DE_MEDICAMENTO = {
  "GENERICO": "Genérico",
  "SIMILAR": "Similar",
  "GENER/SIMILAR S/GT": "Genérico ou similar",
  "ETICO": "Medicamento de referência",
  "ETICO CONTROLADO": "Medicamento de referência",
  "ANTICONCEPCIONAL": "Anticoncepcional"
};

/* O Bulário Eletrônico da Anvisa, pelo número de registro.

   Link, e não cópia hospedada aqui. A bula muda quando o laboratório
   altera o produto, e uma bula velha no site de uma farmácia é pior do
   que bula nenhuma: o cliente lê posologia que já não vale. Linkando, a
   fonte é sempre a oficial e não há nada para manter. */
function linkDaBula(registro) {
  const numero = String(registro || "").replace(/\D/g, "");
  if (numero.length < 9) return "";
  return `https://consultas.anvisa.gov.br/#/bulario/q/?numeroRegistro=${numero}`;
}

/* Ficha técnica: só as linhas que existem para ESTE produto.

   Uma tabela com "Classe: —" em metade das linhas parece cadastro mal
   feito. Shampoo não tem princípio ativo nem registro na Anvisa, e para
   ele a ficha inteira simplesmente não aparece. */
function fichaTecnicaHTML(p) {
  const linhas = [
    ["Princípio ativo", p.substancia],
    ["Classe", p.classeTerapeutica],
    ["Tipo", TIPO_DE_MEDICAMENTO[(p.categoria || "").trim().toUpperCase()]],
    ["Laboratório", p.laboratorio || p.marca],
    ["Tarja", p.tarjaNome],
    ["Registro Anvisa", p.registroAnvisa],
    ["Código de barras", p.ean]
  ].filter(([, valor]) => String(valor || "").trim());

  if (linhas.length < 2) return "";

  const bula = linkDaBula(p.registroAnvisa);

  return `
    <section class="ficha-tecnica" aria-label="Ficha técnica">
      <h2>Ficha técnica</h2>
      <dl>
        ${linhas.map(([rotulo, valor]) => `
          <div>
            <dt>${esc(rotulo)}</dt>
            <dd>${esc(String(valor).trim())}</dd>
          </div>`).join("")}
      </dl>

      ${bula ? `
        <a class="btn-bula" href="${esc(bula)}" target="_blank" rel="noopener">
          ${icone("receita", 15)}Ler a bula no site da Anvisa
        </a>
        <p class="ficha-fonte">
          Dados da lista de preços da CMED/Anvisa. A bula abre no portal oficial,
          sempre na versão vigente.
        </p>` : `
        <p class="ficha-fonte">Dados da lista de preços da CMED/Anvisa.</p>`}
    </section>`;
}

/* A mesma lógica do botão do card, no tamanho da página de produto.

   Aqui havia os dois ao mesmo tempo: um contador marcando 0 e, embaixo,
   "Adicionar ao carrinho". Um contador em zero não é controle de nada —
   é uma pergunta sem resposta em cima do botão que já responde. E ficava
   diferente do card, onde o contador só nasce depois que o produto entra
   no carrinho.

   Agora é um ou outro, como no card: sem nada no carrinho, só o botão;
   com o produto dentro, só o contador. E na última unidade o "−" vira
   lixeira, porque tirar o único item não é diminuir quantidade, é
   remover o produto. */
function acoesDoDetalheHTML(p, qtd) {
  const codigo = esc(p.codigo);
  const nome = esc(p.nome);

  if (qtd > 0) {
    const remover = qtd === 1
      ? { simbolo: icone("trash", 14), rotulo: `Remover ${nome} do carrinho` }
      : { simbolo: "−", rotulo: `Remover uma unidade de ${nome}` };

    return `
      <div class="controle controle-detalhe">
        <button data-acao="menos" data-codigo="${codigo}" aria-label="${remover.rotulo}">${remover.simbolo}</button>
        <span aria-live="polite">${qtd}</span>
        <button data-acao="mais" data-codigo="${codigo}" aria-label="Adicionar uma unidade de ${nome}">+</button>
      </div>

      <a class="btn-comprar btn-ir-carrinho" href="/carrinho.html">
        ${icone("cart", 16)}Ver carrinho
      </a>
    `;
  }

  return `
    <button class="btn-comprar" data-acao="comprar" data-codigo="${codigo}"
            aria-label="Adicionar ${nome} ao carrinho">
      ${icone("cart-add", 16)}Adicionar ao carrinho
    </button>
  `;
}

/* Redesenha o bloco inteiro, e não só o número: em 0 ele é um botão, em
   1 é o contador com lixeira. Chamado pelo atualizarQtdNaTela do
   script.js, que é quem sabe que a quantidade mudou. */
function repintarAcoesDoDetalhe(p, qtd) {
  const alvo = document.getElementById("acoesDetalhe");
  if (!alvo || !p) return;

  const tinhaFoco = alvo.contains(document.activeElement)
    ? document.activeElement.dataset.acao
    : null;

  alvo.innerHTML = acoesDoDetalheHTML(p, qtd);

  if (tinhaFoco) alvo.querySelector(`[data-acao="${tinhaFoco}"]`)?.focus();
}

/* a delegação do script.js cobre mais/menos/receita; aqui só o "comprar" */
document.addEventListener("click", ev => {
  const alvo = ev.target.closest('[data-acao="comprar"]');
  if (!alvo) return;
  ev.preventDefault();
  adicionarAoCarrinhoDetalhe(alvo.dataset.codigo);
});

/* Qual produto esta URL pede.

   Dois formatos convivem, de propósito:

     /produto/dipirona-500mg-7891234567890   endereço novo, por EAN
     /produto?codigo=000123                  endereço antigo, por código

   O antigo tem de continuar funcionando: está em link mandado por
   WhatsApp, em aba salva e no índice do Google. Some quando o Google
   reindexar — não antes.

   O EAN vem do fim do caminho porque é de lá que a função do servidor
   também o tira; o trecho de nome é enfeite para a busca e não participa
   da identificação. Então um nome desatualizado no link (produto que
   mudou de descrição) ainda abre a página certa. */
/* O slug da farmácia, quando o endereço é o de compra.

   /loja/mais-barato/produto/dipirona-789...  ->  "mais-barato"
   /produto/dipirona-789...                   ->  ""

   Vazio significa "página do produto, sem loja" — e é o que decide se a
   página declara uma oferta com vendedor ou uma faixa de preços. */
function lojaDaURL() {
  const achado = /^\/loja\/([a-z0-9-]+)\//.exec(decodeURIComponent(window.location.pathname));
  return achado ? achado[1] : "";
}

function produtoPedidoNaURL() {
  if (typeof produtos === "undefined" || !produtos.length) return null;

  const caminho = decodeURIComponent(window.location.pathname);
  const achado = /(\d{8,14})\/?$/.exec(caminho);

  if (achado) {
    const ean = achado[1];
    const porEan = produtos.find(p => String(p.ean) === ean);
    if (porEan) return porEan;
  }

  const codigo = new URLSearchParams(window.location.search).get("codigo");
  if (codigo) return produtos.find(p => String(p.codigo) === String(codigo)) || null;

  return null;
}

/* Corrige a cabeça da página com o produto de verdade.

   A função do servidor (functions/produto/[[rota]].js) já escreveu
   título, descrição e foto a partir da URL, sem ler o catálogo — é o
   que o WhatsApp e o Facebook leem, porque eles não rodam JavaScript.
   O que ela não tem como saber: o acento do nome, o preço e se está em
   estoque. Isso entra aqui, e o Google — que roda JavaScript — acaba
   indexando a versão completa.

   O Product/Offer só é escrito com preço: oferta sem preço é dado
   estruturado incompleto, e a Busca reclama em vez de mostrar. */
function ajustarMetaDoProduto(p) {
  const titulo = `${p.nome} — Drogaria Mais Barato`;
  document.title = titulo;

  const por = (seletor, atributo, valor) => {
    const el = document.querySelector(seletor);
    if (el) el.setAttribute(atributo, valor);
  };

  const descricao = `${p.nome}. Compre na Drogaria Mais Barato, em São Bernardo do Campo, com entrega em até 2 horas.`;

  por('meta[name="description"]', "content", descricao);
  por('meta[property="og:title"]', "content", titulo);
  por('meta[property="og:description"]', "content", descricao);
  por('meta[name="twitter:title"]', "content", titulo);
  por('meta[name="twitter:description"]', "content", descricao);
  por('meta[property="og:image:alt"]', "content", p.nome);

  if (!p.preco) return;

  /* A oferta muda conforme a rota, e isso não é detalhe:

       /loja/<slug>/produto/...   Offer, com vendedor e preço daquela
                                  farmácia — é uma oferta de verdade,
                                  feita por alguém, com botão de comprar

       /produto/...               AggregateOffer, sem vendedor — é a
                                  página do produto, que fala de todas as
                                  farmácias, e dizer "vendido por X" nela
                                  seria mentira assim que existir a
                                  segunda loja

     Com uma loja só, o preço mínimo e o máximo coincidem e a contagem é
     1. Fica correto hoje e continua correto depois, sem reescrever. */
  const daLoja = lojaDaURL();
  const preco = Number(p.preco).toFixed(2);
  const disponibilidade = semEstoque(p)
    ? "https://schema.org/OutOfStock"
    : "https://schema.org/InStock";
  const aqui = window.location.origin + window.location.pathname;

  const oferta = daLoja
    ? {
        "@type": "Offer",
        url: aqui,
        priceCurrency: "BRL",
        price: preco,
        availability: disponibilidade,
        seller: {
          "@type": "Pharmacy",
          name: (typeof LOJA !== "undefined" && LOJA && LOJA.nome) || "Drogaria Mais Barato"
        }
      }
    : {
        "@type": "AggregateOffer",
        url: aqui,
        priceCurrency: "BRL",
        lowPrice: preco,
        highPrice: preco,
        offerCount: 1,
        availability: disponibilidade
      };

  const dados = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.nome,
    sku: String(p.codigo),
    gtin13: String(p.ean || "") || undefined,
    brand: (p.marca || p.laboratorio) ? { "@type": "Brand", name: p.marca || p.laboratorio } : undefined,
    image: p.imagem || undefined,
    offers: oferta
  };

  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = JSON.stringify(dados);
  document.head.appendChild(script);
}

async function initProdutoPage() {
  mostrarSkeletonProduto();
  const { ok } = await aguardarProdutos();

  if (!ok || typeof produtos === "undefined" || !produtos.length) {
    mostrarErroConexao();
    return;
  }

  const produto = produtoPedidoNaURL();

  if (!produto) {
    mostrarProdutoNaoEncontrado();
    return;
  }

  renderProdutoDetalhe(produto);
  ajustarMetaDoProduto(produto);
}

document.addEventListener("DOMContentLoaded", initProdutoPage);

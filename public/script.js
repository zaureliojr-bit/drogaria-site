/* =========================
⚙️ CONFIG
========================= */
const API_PRODUTOS =
"https://raw.githubusercontent.com/zaureliojr-bit/Produtos/refs/heads/main/produtos.json";

const API_PEDIDOS =
"https://script.google.com/macros/s/AKfycbxkYaQekyFpkptlBPxz5CoyR50sJU_gzLC8tVuW6rWTSJejk0_BRQGaSRkapnMUhWszLw/exec";

/* Histórico de pedidos no D1 (ver pedidos-proxy, no repositório do
   padronizador). Aqui os itens vão como lista, e não como uma linha de
   texto — é isso que permite o painel somar produtos vendidos.

   A planilha continua recebendo em paralelo. Enquanto esta constante
   estiver vazia o site nem tenta enviar para cá, então dá para publicar
   antes de o worker existir. Cole a URL do worker quando ele estiver no
   ar, algo como https://farmatech-pedidos-proxy.SEU-SUBDOMINIO.workers.dev */
const API_PEDIDOS_D1 = "https://farmatech-pedidos-proxy.zaureliojr.workers.dev";

const WHATS_LOJA = "5511925190101";
const POR_PAGINA = 12;

/* Produtos das listas A/B da Portaria 344 (retenção de receita sempre
   presencial) não entram no carrinho: em vez de "Adicionar", o cliente é
   levado ao WhatsApp para falar com a farmacêutica. Se a Dra. Laís
   definir outro fluxo, mude para false. */
const BLOQUEAR_CONTROLADOS = true;

/* Tabela de tarja da CMED (ANVISA), por EAN — usada só como informação
   (rótulo "venda sob prescrição" no card/detalhe). Quem manda no
   carrinho é bloqueioPresencial/receitaRemota, calculados pelo
   padronizador a partir da Portaria 344: tarja vermelha sozinha
   (antibiótico comum, anticoncepcional) NÃO bloqueia mais — só quem
   está de fato nas listas A/B (bloqueio total) ou C (entrega remota
   com receita) da Portaria.

   Se o arquivo não carregar, a tarja simplesmente não aparece — não
   afeta o carrinho. Para atualizar, baixe a lista nova em
   gov.br/anvisa/pt-br/assuntos/medicamentos/cmed/precos e gere o
   arquivo de novo. */
const API_TARJAS = "tarjas.json";

/* Frete grátis a partir de: use 0 para desativar.
   Enquanto for 0, o banner NÃO deve prometer frete grátis. */
const FRETE_GRATIS_ACIMA_DE = 0;

/* Quantas seções de categoria já vêm montadas na home. As demais
   são montadas conforme o cliente rola (IntersectionObserver). */
const SECOES_INICIAIS = 4;

/* Validade do catálogo guardado no navegador (evita rebaixar 3 MB
   ao navegar entre a home e a página de produto). */
/* v6: exigeReceita deixou de bloquear por tarja sozinha e passou a
   bloquear pela Portaria 344 (bloqueioPresencial/receitaRemota) — um
   cache v5 traria de volta o bloqueio antigo (e incorreto) até expirar. */
/* ATENÇÃO: o cache guarda o produto JÁ MAPEADO, não o JSON cru. Campo
   novo no mapearProduto = chave nova aqui, sem exceção.
   Foi exatamente o que faltou quando temEstoque entrou: quem tinha a aba
   aberta continuou lendo produtos mapeados pelo código anterior, sem o
   campo, e a vitrine inteira apareceu como "Indisponível no momento". */
const CACHE_CHAVE = "catalogo_v9";
const CACHE_MINUTOS = 30;

/* =========================
🖼️ IMAGEM DE "PRODUTO SEM FOTO"
Arte da própria loja (caixa genérica, com o aviso da RDC 71/2009).
Fica hospedada junto do site, e não num serviço externo: hoje todo o
catálogo cai neste arquivo, então se o host sair do ar a vitrine
inteira vai junto.
========================= */
const IMAGEM_SEM_FOTO = "sem-imagem.webp";              // com o selo "Medicamento Genérico"
const IMAGEM_SEM_FOTO_NEUTRA = "sem-imagem-neutra.webp"; // mesma caixa, sem o selo

/* Só estas classes podem exibir a caixa com o selo "Medicamento Genérico".
   Um ETICO é medicamento de referência, não genérico — para ele e para os
   demais medicamentos entra a caixa neutra, que mantém a marca e o aviso
   de prescrição, mas sem o selo. */
const CATS_COM_SELO_GENERICO = ["GENERICO", "SIMILAR", "GENER/SIMILAR S/GT"];

/* As duas caixas dizem "VENDA SOB PRESCRIÇÃO MÉDICA", então nenhuma delas
   entra fora de medicamento: perfume, shampoo e mamadeira seguem com a
   ilustração neutra em SVG. Mude para true para usar em todo o catálogo. */
const IMAGEM_SEM_FOTO_EM_TUDO = false;

/* =========================
🛡️ ESCAPE
Descrições do FarmaxPDV contêm aspas e & — ex.: AGULHA DESC. ... ( 22G1 1/4" ).
Sem escapar, elas quebram o atributo e o navegador inventa tags.
========================= */
function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* texto sem acento e em minúsculas, para busca */
function normalizar(v) {
  return String(v == null ? "" : v)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/* =========================
🖼️ IMAGENS FICTÍCIAS (fallback)
Quando o produto não tem foto real, usamos uma ilustração genérica que
varia pelo tipo do produto, pra não ficar tudo com a mesma imagem vazia.
========================= */
function _svgDataUri(miolo, escala = 1.35) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect width="100" height="100" rx="14" fill="#F1F2F5"/>
    <g transform="translate(50 50) scale(${escala}) translate(-50 -50)">
      ${miolo}
    </g>
  </svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

const PLACEHOLDERS = {
  comprimido: _svgDataUri(`
    <rect x="26" y="24" width="48" height="52" rx="8" fill="none" stroke="#767F92" stroke-width="3"/>
    <circle cx="38" cy="38" r="5" fill="#767F92"/>
    <circle cx="62" cy="38" r="5" fill="#767F92"/>
    <circle cx="38" cy="56" r="5" fill="#FFD400"/>
    <circle cx="62" cy="56" r="5" fill="#767F92"/>
    <circle cx="38" cy="68" r="5" fill="#767F92"/>
    <circle cx="62" cy="68" r="5" fill="#767F92"/>
  `),
  xarope: _svgDataUri(`
    <rect x="40" y="20" width="20" height="10" rx="2" fill="#767F92"/>
    <path d="M38 30 h24 v10 l6 8 v28 a4 4 0 0 1 -4 4 H36 a4 4 0 0 1 -4 -4 V48 l6 -8 Z"
      fill="none" stroke="#767F92" stroke-width="3" stroke-linejoin="round"/>
    <path d="M34 58 h32 v14 a4 4 0 0 1 -4 4 H38 a4 4 0 0 1 -4 -4 Z" fill="#FFD400" opacity="0.55"/>
    <line x1="40" y1="46" x2="60" y2="46" stroke="#767F92" stroke-width="2"/>
  `),
  pomada: _svgDataUri(`
    <path d="M42 22 h16 v10 l6 6 v30 a10 10 0 0 1 -10 10 h-8 a10 10 0 0 1 -10 -10 V38 l6 -6 Z"
      fill="none" stroke="#767F92" stroke-width="3" stroke-linejoin="round"/>
    <rect x="42" y="20" width="16" height="6" rx="1.5" fill="#767F92"/>
    <line x1="38" y1="50" x2="62" y2="50" stroke="#FFD400" stroke-width="4"/>
    <line x1="38" y1="60" x2="62" y2="60" stroke="#767F92" stroke-width="2" opacity="0.5"/>
  `),
  spray: _svgDataUri(`
    <rect x="40" y="42" width="20" height="34" rx="5" fill="none" stroke="#767F92" stroke-width="3"/>
    <rect x="45" y="30" width="10" height="12" fill="#767F92"/>
    <path d="M55 26 h10 v6 h-10 Z" fill="#FFD400"/>
    <line x1="65" y1="24" x2="72" y2="20" stroke="#767F92" stroke-width="3" stroke-linecap="round"/>
    <line x1="44" y1="54" x2="56" y2="54" stroke="#767F92" stroke-width="2" opacity="0.5"/>
    <line x1="44" y1="62" x2="56" y2="62" stroke="#767F92" stroke-width="2" opacity="0.5"/>
  `),
  cosmetico: _svgDataUri(`
    <rect x="43" y="22" width="14" height="8" rx="2" fill="#767F92"/>
    <path d="M38 30 h24 a4 4 0 0 1 4 4 v34 a8 8 0 0 1 -8 8 H42 a8 8 0 0 1 -8 -8 V34 a4 4 0 0 1 4 -4 Z"
      fill="none" stroke="#767F92" stroke-width="3"/>
    <circle cx="50" cy="54" r="9" fill="#FFD400" opacity="0.6"/>
  `),
  cabelo: _svgDataUri(`
    <rect x="41" y="18" width="18" height="8" rx="2" fill="#767F92"/>
    <path d="M38 26 h24 a5 5 0 0 1 5 5 v39 a6 6 0 0 1 -6 6 H39 a6 6 0 0 1 -6 -6 V31 a5 5 0 0 1 5 -5 Z"
      fill="none" stroke="#767F92" stroke-width="3"/>
    <rect x="38" y="44" width="24" height="14" rx="3" fill="#FFD400" opacity="0.55"/>
  `),
  generico: _svgDataUri(`
    <rect x="28" y="30" width="44" height="40" rx="6" fill="none" stroke="#767F92" stroke-width="3"/>
    <rect x="26" y="24" width="48" height="10" rx="3" fill="#767F92"/>
    <line x1="50" y1="42" x2="50" y2="58" stroke="#FFD400" stroke-width="5" stroke-linecap="round"/>
    <line x1="42" y1="50" x2="58" y2="50" stroke="#FFD400" stroke-width="5" stroke-linecap="round"/>
  `)
};

/* detecta o "tipo" do produto pelo nome (abreviações do FarmaxPDV) e pela categoria */
function tipoImagemProduto(nome, categoria) {
  const n = (nome || "").toUpperCase();
  const c = (categoria || "").toUpperCase();

  if (/\b(XPE|XAROPE|SUSP|SOLUC?AO|GTS|GOTAS?)\b/.test(n)) return "xarope";
  if (/\b(CREM|POMADA|GEL|LOCAO|LOÇÃO)\b/.test(n)) return "pomada";
  if (/\b(SPRAY|AEROSOL|NASAL|SPR)\b/.test(n)) return "spray";
  if (/\b(COMP|CAPS|DRG|CPR|COM\.)\b/.test(n)) return "comprimido";

  if (/SHAMPOO|CONDICIONADOR|TINT|CABELO|CACHO/.test(c + " " + n)) return "cabelo";
  if (c.includes("PERFUM") || c.includes("COSMET") || c.includes("HIGIENE")) return "cosmetico";

  return "generico";
}

function placeholderProduto(nome, categoria) {
  return PLACEHOLDERS[tipoImagemProduto(nome, categoria)] || PLACEHOLDERS.generico;
}

/* O produto guarda só o TIPO do ícone ("comprimido", "xarope"...), não a
   imagem inteira: cada data-URI tem ~700 bytes e, multiplicado por 5 mil
   produtos, estourava o cache do navegador sozinho. */
function svgDe(p) {
  return PLACEHOLDERS[p.tipoImg] || PLACEHOLDERS.generico;
}

/* O que aparece quando o produto não tem foto própria:
   genérico/similar -> caixa com o selo · demais medicamentos -> caixa neutra
   · resto do catálogo -> ilustração em SVG. */
function fallbackDe(p) {
  if (IMAGEM_SEM_FOTO_EM_TUDO || p.ehMedicamento) {
    return p.temSeloGenerico ? IMAGEM_SEM_FOTO : IMAGEM_SEM_FOTO_NEUTRA;
  }
  return svgDe(p);
}

function imagemDe(p) {
  return p.imagem || fallbackDe(p);
}

/* FRETE — faixas fixas por distância */
const LOJA_LAT = -23.7092450;
const LOJA_LNG = -46.5251954;
const RAIO_MAX_KM = 8;

/* =========================
🏷️ FAMÍLIAS DE CATEGORIA
O FarmaxPDV exporta 51 categorias internas ("ETICO", "GENER/SIMILAR S/GT",
"PRESTOBARBA"...). Elas viram um punhado de famílias com nome de gente,
que é o que aparece nos filtros e nas seções da home.
Categoria nova que não estiver aqui cai em "Outros" — é só acrescentar.
========================= */
function chaveCategoria(cat) {
  return (cat || "").trim().toUpperCase().replace(/\s+/g, " ");
}

/* "medicamento: true" faz a família usar a caixa genérica da loja quando o
   produto não tem foto. "receita: true" tira o produto do carrinho e manda
   o cliente falar com a farmacêutica. */
const FAMILIAS = [
  { id: "medicamentos", nome: "Medicamentos", medicamento: true,
    cats: ["ETICO", "GENERICO", "SIMILAR", "GENER/SIMILAR S/GT", "CARTELADOS"] },

  { id: "receita", nome: "Exigem receita", receita: true, medicamento: true,
    cats: ["ETICO CONTROLADO"] },

  { id: "anticoncepcional", nome: "Anticoncepcionais", medicamento: true,
    cats: ["ANTICONCEPCIONAL"] },

  { id: "vitaminas", nome: "Vitaminas e Suplementos",
    cats: ["VITAMINAS", "SUPLEMENTO"] },

  { id: "cabelo", nome: "Cabelo",
    cats: ["SHAMPOO", "CONDICIONADOR", "CREME PENTEAR", "CREME TRATAMENTO", "OLEO CAPILAR",
           "GEL FIXADOR CABELO", "TINTURA", "CR ALIS E MATIZADOR", "KIT SHAMPO/COND",
           "ESCOVA DE CABELO", "PENTE E ESCOVA"] },

  { id: "pele", nome: "Cuidados com a Pele",
    cats: ["DERMOCOSMETICO", "HIDRATANTE", "PROTETOR SOLAR", "OLEO CORPORAL",
           "LOÇAO FACIAL", "LOCAO FACIAL", "SABONETE LIQUIDO", "SABONETE BARRA"] },

  { id: "perfumaria", nome: "Perfumaria",
    cats: ["PERFUME", "DESODORANTE", "TALCO"] },

  { id: "higiene", nome: "Higiene Pessoal",
    cats: ["HIGIENE BUCAL", "HIGIENE PESSOAL", "ABSORVENTE", "PRESERVATIVO",
           "PRESTOBARBA", "DEPILATORIO"] },

  { id: "beleza", nome: "Beleza e Maquiagem",
    cats: ["ESMALTES", "MAQUIAGEM"] },

  { id: "infantil", nome: "Infantil",
    cats: ["LINHA INFANTIL", "FR INFANTIL", "FORMULA LEITE"] },

  { id: "saude", nome: "Saúde e Bem-estar",
    cats: ["FR GERIATRICA", "ORTOPED", "LUVAS", "PERF/APLIC/AFERICAO", "REPELENTE",
           "TESOURA", "OFICINAL HOSPITALAR"] },

  { id: "conveniencia", nome: "Conveniência",
    cats: ["CONVENIENCIA", "DIVERSOS", "VAREJO", "PREMIUM 10", "HAVAIANA"] }
];

const FAMILIA_OUTROS = { id: "outros", nome: "Outros", cats: [] };

const _indiceFamilia = new Map();
FAMILIAS.forEach(f => f.cats.forEach(c => _indiceFamilia.set(chaveCategoria(c), f)));

function familiaDe(categoria) {
  return _indiceFamilia.get(chaveCategoria(categoria)) || FAMILIA_OUTROS;
}

function nomeFamilia(id) {
  if (id === "ofertas") return "Ofertas";
  const f = FAMILIAS.find(x => x.id === id);
  return f ? f.nome : FAMILIA_OUTROS.nome;
}

const FAIXAS_FRETE = [
  { ate: 3.9, valor: 3.00 },
  { ate: 5,   valor: 5.00 },
  { ate: 6,   valor: 6.00 }
];
const FRETE_BASE_ACIMA = 7.00;   // acima de 6km: base...
const FRETE_KM_ACIMA = 1.50;     // ...+ R$1,50 por km excedente

function calcularValorFrete(dist) {
  const faixa = FAIXAS_FRETE.find(f => dist <= f.ate);
  if (faixa) return faixa.valor;
  return FRETE_BASE_ACIMA + (dist - 6) * FRETE_KM_ACIMA;
}

/* =========================
🗄️ ESTADO
========================= */
let produtos = [];
let produtosFiltrados = [];
let maisVendidos = [];
let carrinho = carregarCarrinho();
let categoriaAtual = "todas";
let termoBusca = "";
let modoOfertas = false;
let ordenacao = "relevancia";
let pagina = 0;
let carregando = false;
let freteCalculado = null;
let timeoutBusca;
let toastTimer;

/* localStorage inválido não pode derrubar o site inteiro: antes, um
   JSON.parse solto aqui em cima impedia TODO o resto de rodar. */
function carregarCarrinho() {
  try {
    const bruto = localStorage.getItem("carrinho");
    const lista = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista.filter(i => i && i.codigo) : [];
  } catch (e) {
    console.warn("Carrinho salvo estava inválido, começando vazio.", e);
    try { localStorage.removeItem("carrinho"); } catch (_) {}
    return [];
  }
}

/* =========================
🛠️ HELPERS
========================= */
const el = id => document.getElementById(id);

const fmt = v =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// preço com tipografia em duas escalas: R$ + parte inteira grande + centavos pequenos
function precoGrandeHTML(v) {
  const partes = Number(v || 0)
    .toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .split(",");
  return `<span class="preco-cifra">R$</span><span class="preco-reais">${partes[0]}</span><span class="preco-centavos">,${partes[1] || "00"}</span>`;
}

function descontoPercent(original, promo) {
  const o = Number(original || 0);
  const p = Number(promo || 0);
  if (!o || !p || p >= o) return 0;
  return Math.round((1 - p / o) * 100);
}

function telValido(tel) {
  return tel.replace(/\D/g, "").length >= 10;
}

function icone(id, tam = 14) {
  return `<svg class="ic" width="${tam}" height="${tam}" aria-hidden="true"><use href="#ic-${id}"></use></svg>`;
}

function toast(msg) {
  const t = el("toast");
  if (!t) return;
  clearTimeout(toastTimer);
  t.textContent = msg;
  t.className = "toast ativo";
  toastTimer = setTimeout(() => (t.className = "toast"), 3200);
}

function mostrarLoader(ligado) {
  const l = el("loader");
  if (!l) return;
  l.classList.toggle("ativo", !!ligado);
  l.setAttribute("aria-hidden", ligado ? "false" : "true");
}

/* =========================
🕒 STATUS LOJA
========================= */
function atualizarStatusLoja() {
  const statusEl = el("status");
  if (!statusEl) return;

  const agora = new Date();
  const dia = agora.getDay();
  const minutos = agora.getHours() * 60 + agora.getMinutes();

  const domingo = dia === 0;
  const abre = domingo ? 8 * 60 : 7 * 60;
  const fecha = domingo ? 19 * 60 + 30 : 21 * 60 + 30;

  const aberto = minutos >= abre && minutos < fecha;

  statusEl.innerHTML = `<i class="status-dot" aria-hidden="true"></i>${aberto ? "Aberto" : "Fechado"}`;
  statusEl.className = aberto ? "status-aberto" : "status-fechado";
}

/* =========================
🚀 INIT
========================= */
document.addEventListener("DOMContentLoaded", () => {
  carregar();

  atualizarStatusLoja();
  setInterval(atualizarStatusLoja, 60000);

  el("busca")?.addEventListener("input", e => {
    clearTimeout(timeoutBusca);
    const valor = e.target.value;
    timeoutBusca = setTimeout(() => {
      termoBusca = normalizar(valor);
      modoOfertas = false;
      aplicarFiltro();
    }, 300);
  });

  el("ordenacao")?.addEventListener("change", e => {
    ordenacao = e.target.value;
    aplicarFiltro();
  });

  el("voltarTopo")?.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.addEventListener("scroll", () => {
    // Na home o grid está escondido (quem aparece são as seções por família).
    // Sem esta guarda, o scroll ficava montando cards dentro de um container
    // com display:none — trabalho jogado fora a cada rolagem.
    if (carregando || estaNaHome()) return;

    const dist =
      document.documentElement.scrollHeight - window.scrollY - window.innerHeight;

    if (dist < 400) renderMais();
  });

  ligarDelegacaoDeCliques();
  _atualizarBarraFiltros = ligarBarraFiltros();
  toggleEndereco();
  iniciarBanner();
  girarAvisosDoCabecalho();
});

/* =========================
📣 RECADOS DO CABEÇALHO
=========================
Alterna os três recados da loja, um a cada quatro segundos e meio —
tempo de ler sem pressa e sem cansar quem fica na página.

Só roda quando a aba está à frente. Um intervalo girando numa aba
esquecida em segundo plano gasta bateria do celular para trocar um texto
que ninguém está vendo. */
const AVISO_SEGUNDOS = 4.5;

function girarAvisosDoCabecalho() {
  const avisos = document.querySelectorAll(".header-aviso");
  if (avisos.length < 2) return;

  let atual = 0;
  let timer = null;

  const trocar = () => {
    avisos[atual].classList.remove("ativo");
    atual = (atual + 1) % avisos.length;
    avisos[atual].classList.add("ativo");
  };

  const ligar = () => { if (!timer) timer = setInterval(trocar, AVISO_SEGUNDOS * 1000); };
  const desligar = () => { if (timer) { clearInterval(timer); timer = null; } };

  document.addEventListener("visibilitychange", () => {
    document.visibilityState === "hidden" ? desligar() : ligar();
  });

  ligar();
}

function estaNaHome() {
  return categoriaAtual === "todas" && !termoBusca && !modoOfertas;
}

/* =========================
🖱️ DELEGAÇÃO DE CLIQUES
Um listener só, no documento, em vez de onclick escrito dentro de cada card.
Some o risco de nome de produto com aspas quebrar o HTML.
========================= */
function ligarDelegacaoDeCliques() {
  document.addEventListener("click", ev => {
    const alvo = ev.target.closest("[data-acao]");
    if (!alvo) return;

    const acao = alvo.dataset.acao;
    const codigo = alvo.dataset.codigo;

    if (acao === "mais")            { ev.preventDefault(); mais(codigo); }
    else if (acao === "menos")      { ev.preventDefault(); menos(codigo); }
    else if (acao === "filtrar")    { ev.preventDefault(); filtrarCategoria(alvo.dataset.familia); }
    else if (acao === "ofertas")    { ev.preventDefault(); verOfertas(); }
    else if (acao === "receita")    { ev.preventDefault(); falarSobreReceita(codigo); }
    else if (acao === "encomendar") { ev.preventDefault(); encomendarProduto(codigo); }
    else if (acao === "banner")     { ev.preventDefault(); adicionarDoBanner(codigo); }
    else if (acao === "recarregar") { ev.preventDefault(); carregar(); }
    else if (acao === "voltar-vitrine") { ev.preventDefault(); voltarParaVitrine(); }
  });
}

/* =========================
📡 CARREGAR PRODUTOS
========================= */
/* =========================
💊 TARJA (CMED / ANVISA)
========================= */
/* P = preta (Portaria 344)  R = vermelha sob restrição
   V = vermelha              L = livre, isento de prescrição (MIP)
   Só informativo agora - não decide mais o bloqueio do carrinho (ver
   bloqueioPresencial/receitaRemota em mapearProduto). */
let _tarjas = null;   // Map<eanNumerico, "P"|"R"|"V"|"L">

const TARJA_ROTULO = {
  P: "Tarja preta — retenção de receita",
  R: "Tarja vermelha sob restrição",
  V: "Tarja vermelha — venda sob prescrição",
  L: "Isento de prescrição"
};

async function carregarTarjas() {
  try {
    const resposta = await fetch(API_TARJAS);
    if (!resposta.ok) throw new Error("HTTP " + resposta.status);

    const { tarjas } = await resposta.json();
    const mapa = new Map();

    // o gerador já entrega cada EAN uma vez só, na tarja mais restritiva.
    // A ordem aqui garante isso de novo: se um EAN repetir, fica a pior,
    // e não a que aparecer por último no arquivo.
    const peso = { P: 4, R: 3, V: 2, L: 1 };
    Object.keys(tarjas || {}).forEach(codigo => {
      (tarjas[codigo] || []).forEach(ean => {
        if (peso[codigo] > (peso[mapa.get(ean)] || 0)) mapa.set(ean, codigo);
      });
    });

    _tarjas = mapa;
  } catch (e) {
    // Sem a tabela o site não para: cai na regra por categoria, que é
    // mais frouxa. O aviso fica no console para aparecer em teste.
    console.error("Tabela de tarjas não carregou; usando só a categoria.", e);
    _tarjas = null;
  }
}

function tarjaDe(ean) {
  if (!_tarjas) return "";
  const n = Number(String(ean || "").replace(/\D/g, ""));
  return n ? (_tarjas.get(n) || "") : "";
}

/* O "estoque" do FarmaxPDV já chegou aqui como número, como "S"/"N" e
   como célula vazia. Campo ausente ou ilegível vale como DISPONÍVEL: se
   um dia a coluna sumir da exportação, é melhor a loja vender do que a
   vitrine inteira aparecer esgotada.
   Fica aqui, e não em cada página, porque a grade e a página do produto
   precisam responder a mesma coisa sobre o mesmo item. */
function temEstoqueDe(estoque) {

  if (estoque === undefined || estoque === null || String(estoque).trim() === "") return true;

  const n = Number(String(estoque).replace(",", "."));
  if (!isNaN(n)) return n > 0;

  const t = String(estoque).trim().toUpperCase();
  if (["N", "NAO", "NÃO", "FALSE", "INDISPONIVEL"].includes(t)) return false;

  return true;
}

/* O export do padronizador só escreve o campo quando ele é VERDADEIRO:
   produto que não precisa de receita não recebe "confirmarReceita: false",
   ele simplesmente não tem a chave. Então ausência não é "não sei" — é
   "não", desde que o catálogo use o campo em algum lugar.

   Era essa leitura que fazia todo tarjado pedir receita: o teste era por
   produto (typeof === "boolean"), lia a ausência como desconhecido e
   voltava ao critério antigo, que é a tarja vermelha inteira.

   A pergunta certa é sobre o CATÁLOGO, não sobre o produto: se algum
   produto traz o campo, o padronizador está marcando, e quem não tem é
   porque não precisa. Se nenhum traz, o catálogo é anterior à mudança e
   aí sim vale o critério antigo — controle sanitário não pode ficar sem
   regra nenhuma enquanto o dado não chega. */
let catalogoMarcaConfirmarReceita = false;

/* A pergunta é "está marcado como esgotado?", e não "tem o campo?".
   Só o false explícito tira o produto da venda; undefined é ausência de
   informação e vale como disponível. É o que impede um produto guardado
   por uma versão anterior do site — ou um export sem a coluna — de
   sumir da loja inteira. Falhar vendendo é melhor que falhar escondendo. */
function semEstoque(p) {
  return p && p.temEstoque === false;
}

function mapearProduto(p) {
  const venda = Number(String(p.precoVenda || 0).replace(",", "."));
  const promo = Number(String(p.precoPromocao || 0).replace(",", "."));
  const emOferta = promo > 0 && promo < venda;
  const familia = familiaDe(p.categoria);
  // O padronizador passou a gravar a tarja no próprio produtos.json. Quando
  // ela vem de lá, o tarjas.json não é consultado — e assim que todo o
  // catálogo estiver exportado com o campo, aquele arquivo pode ser apagado.
  const tarja = p.tarja || tarjaDe(p.ean);

  // Retenção de receita sempre presencial (Portaria 344, listas A/B) - tira
  // do carrinho e manda para o WhatsApp. A categoria SOMA bloqueios: nada
  // que já era bloqueado volta a ser vendido porque o produto não bateu
  // com a lista de substâncias do padronizador.
  // Só as listas A/B da Portaria 344 ficam fora do carrinho: elas exigem
  // receita retida e dispensação presencial, e isso não é escolha da loja.
  //
  // A tarja preta entra aqui como rede de segurança. O padronizador só
  // marca bloqueioPresencial quando reconhece a substância; quando o
  // cruzamento com a CMED falha, um Dimorf ou um Concerta passaria batido.
  // A tarja vem do tarjas.json, por outro caminho, e não depende disso.
  const bloqueioPresencial = p.bloqueioPresencial === true || tarja === "P";

  // Todo o resto que precisa de receita É VENDIDO pelo site: a RDC 44/2009
  // permite a venda a distância desde que a receita seja conferida antes da
  // dispensação. Entra no carrinho normalmente, e o checkout cobra a
  // confirmação do envio da receita antes de o pedido ser despachado.
  const precisaDeReceita =
    !bloqueioPresencial && (
      p.receitaRemota === true ||        // listas C da Portaria 344
      !!familia.receita ||               // categoria ETICO CONTROLADO do PDV
      tarja === "V" || tarja === "R"     // tarja vermelha, com ou sem restrição
    );

  /* Confirmação da receita no checkout — quem decide é este campo, e não
     mais a tarja.

     A tarja vermelha é um conjunto grande demais para esta pergunta: ela
     inclui remédio de uso contínuo cuja receita o farmacêutico confere e
     devolve. O campo novo marca só antibiótico e listas C da Portaria
     344, que são os casos em que a receita FICA RETIDA — e é por isso que
     a loja precisa da foto antes de despachar.

     O fallback existe porque isto é controle sanitário, não preferência
     de interface: enquanto o catálogo publicado não trouxer o campo, vale
     o critério antigo. Não pode haver uma janela em que o site simplesmente
     pare de pedir a receita. Quando todo produto trouxer o campo, este
     ramo deixa de ser exercido sozinho. */
  const confirmarReceita = catalogoMarcaConfirmarReceita
    ? p.confirmarReceita === true && !bloqueioPresencial
    : precisaDeReceita;

  return {
    tarja,
    tarjaNome: TARJA_ROTULO[tarja] || "",
    codigo: p.codigo,
    ean: p.ean,
    nome: p.descricao,
    marca: p.marca || "",
    laboratorio: p.laboratorio || "",
    categoria: p.categoria || "",

    familia: familia.id,
    familiaNome: familia.nome,
    // "exigeReceita" aqui quer dizer "não entra no carrinho" — é o nome que
    // o resto do código já usava. Hoje só as listas A/B caem nele.
    exigeReceita: bloqueioPresencial,
    // precisa de receita, mas vende pelo site com conferência antes do envio.
    // Continua sendo o que mostra "Com receita" no card e na página do
    // produto: a informação de que o remédio exige receita segue valendo
    // para a tarja vermelha inteira.
    receitaRemota: precisaDeReceita,

    // recorte menor: só estes obrigam o cliente a confirmar o envio da
    // foto da receita antes de fechar o pedido
    confirmarReceita,
    controleEspecial: p.controleEspecial || "",
    tipoReceita: p.tipoReceita || "",
    ehMedicamento: !!familia.medicamento,
    temSeloGenerico: CATS_COM_SELO_GENERICO.includes(chaveCategoria(p.categoria)),

    preco: emOferta ? promo : venda,
    precoOriginal: venda,
    emOferta,
    desconto: emOferta ? descontoPercent(venda, promo) : 0,

    estoque: p.estoque,

    // Duas informações diferentes, e a distinção importa:
    //   temEstoque = false  -> não dá para comprar agora
    //   encomenda  = true   -> não veio na planilha desta importação, mas
    //                          a loja consegue trazer se o cliente pedir
    // Um item que veio na planilha zerado de propósito (descontinuado)
    // tem temEstoque falso e encomenda falso: fica visível e honesto,
    // sem prometer uma encomenda que não vai acontecer.
    temEstoque: p.encomenda === true ? false : temEstoqueDe(p.estoque),
    encomenda: p.encomenda === true,

    imagem: p.imagem || "",
    tipoImg: tipoImagemProduto(p.descricao, p.categoria),

    // índice de busca: nome + marca + laboratório + EAN, sem acento
    busca: normalizar([p.descricao, p.marca, p.laboratorio, p.ean].filter(Boolean).join(" "))
  };
}

/* guarda o catálogo já mapeado, para não rebaixar 3 MB ao ir e voltar
   da página de produto. Falha em silêncio se não couber. */
function lerCache() {
  try {
    const bruto = sessionStorage.getItem(CACHE_CHAVE);
    if (!bruto) return null;
    const { quando, lista } = JSON.parse(bruto);
    if (!Array.isArray(lista) || !lista.length) return null;
    if (Date.now() - quando > CACHE_MINUTOS * 60000) return null;
    return lista;
  } catch (e) {
    return null;
  }
}

function gravarCache(lista) {
  try {
    sessionStorage.setItem(CACHE_CHAVE, JSON.stringify({ quando: Date.now(), lista }));
  } catch (e) {
    console.info("Catálogo não coube no cache do navegador; seguindo sem ele.");
  }
}

async function carregar() {
  const container = el("produtos");
  mostrarLoader(true);

  try {
    let lista = lerCache();

    if (!lista) {
      // as duas descidas em paralelo: a tarja precisa estar na mão antes
      // de mapear os produtos, senão o bloqueio sai errado.
      const [resposta] = await Promise.all([fetch(API_PRODUTOS), carregarTarjas()]);
      if (!resposta.ok) throw new Error("HTTP " + resposta.status);

      const dados = await resposta.json();

      const crus = (dados.produtos || []).filter(p => p && p.ean && p.descricao);

      // precisa ser decidido ANTES de mapear: o mapearProduto consulta
      // esta resposta produto a produto
      catalogoMarcaConfirmarReceita = crus.some(p => p.confirmarReceita === true);

      lista = crus.map(mapearProduto);

      gravarCache(lista);
    }

    produtos = lista;
    if (!produtos.length) throw new Error("Lista de produtos vazia");

    reconciliarCarrinho();

    // "Mais vendidos" hoje é uma amostra — o export não traz dado de venda.
    // Sorteio estável por dia, para a vitrine não trocar a cada F5.
    maisVendidos = amostraDoDia(produtos.filter(p => !p.exigeReceita), 12);

    gerarFiltros();
    renderCategoriasHome();
    aplicarFiltro();
    renderMaisVendidos();
    renderBannerOfertas();
    renderCarrinho();
    atualizarTotais();

    document.dispatchEvent(new CustomEvent("produtosProntos", { detail: { ok: true } }));
  } catch (e) {
    console.error("Erro ao carregar produtos", e);
    if (container) {
      container.style.display = "grid";
      container.innerHTML = `
        <div class="aviso-vazio">
          <p>Não foi possível carregar os produtos.</p>
          <p class="aviso-vazio-sub">Confira sua conexão e tente de novo.</p>
          <button class="btn-buscar" data-acao="recarregar">Tentar novamente</button>
        </div>
      `;
    }
    document.dispatchEvent(new CustomEvent("produtosProntos", { detail: { ok: false } }));
  } finally {
    mostrarLoader(false);
  }
}

/* sorteio determinístico: muda por dia, não a cada carregamento */
function amostraDoDia(lista, quantos) {
  const hoje = new Date();
  let semente = hoje.getFullYear() * 10000 + (hoje.getMonth() + 1) * 100 + hoje.getDate();
  const rnd = () => {
    semente = (semente * 1103515245 + 12345) % 2147483648;
    return semente / 2147483648;
  };
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia.slice(0, quantos);
}

/* O catálogo é reimportado do FarmaxPDV; o carrinho fica no navegador.
   Sem isto, quem volta depois de um reajuste vê (e pede) o preço antigo. */
function reconciliarCarrinho() {
  if (!carrinho.length) return;

  const antes = carrinho.length;
  let mudouPreco = 0;

  carrinho = carrinho.reduce((acc, item) => {
    const p = produtos.find(x => String(x.codigo) === String(item.codigo));
    if (!p) return acc;                                     // saiu do catálogo
    if (BLOQUEAR_CONTROLADOS && p.exigeReceita) return acc;  // passou a exigir receita
    // Sem esta linha a correção seria só de fachada: o card pararia de
    // oferecer o produto, mas quem já tinha ele no carrinho de ontem
    // fecharia o pedido do mesmo jeito.
    if (semEstoque(p)) return acc;                          // acabou o estoque

    if (Number(item.preco) !== Number(p.preco)) mudouPreco++;

    // relê tudo do catálogo, e não do que estava salvo: é isto que
    // preenche o EAN nos carrinhos guardados antes de ele existir aqui
    acc.push({ codigo: p.codigo, ean: p.ean, nome: p.nome, preco: p.preco, imagem: p.imagem, qtd: item.qtd });
    return acc;
  }, []);

  const removidos = antes - carrinho.length;
  if (removidos || mudouPreco) {
    salvar();
    const partes = [];
    if (mudouPreco) partes.push(`${mudouPreco} ${mudouPreco > 1 ? "preços atualizados" : "preço atualizado"}`);
    if (removidos) partes.push(`${removidos} ${removidos > 1 ? "itens saíram" : "item saiu"} do carrinho`);
    toast(partes.join(" · "));
  }
}

/* =========================
🏷️ FILTROS POR FAMÍLIA
========================= */
function familiasComProdutos() {
  const contagem = new Map();
  produtos.forEach(p => contagem.set(p.familia, (contagem.get(p.familia) || 0) + 1));

  return [...FAMILIAS, FAMILIA_OUTROS]
    .filter(f => contagem.has(f.id))
    .map(f => ({ ...f, total: contagem.get(f.id) }));
}

function gerarFiltros() {
  const container = el("filtros");
  if (!container) return;

  const temOferta = produtos.some(p => p.emOferta);

  container.innerHTML = [
    `<button data-acao="filtrar" data-familia="todas" data-categoria="todas" class="ativo">
       ${icone("home", 13)}Todos
     </button>`,
    temOferta
      ? `<button data-acao="ofertas" data-categoria="ofertas" class="chip-ofertas">
           ${icone("tag", 13)}Ofertas
         </button>`
      : "",
    ...familiasComProdutos().map(f => `
      <button data-acao="filtrar" data-familia="${esc(f.id)}" data-categoria="${esc(f.id)}">
        ${esc(f.nome)}
      </button>`)
  ].join("");

  // os chips acabaram de nascer: recalcula o tamanho do polegar da barra
  if (_atualizarBarraFiltros) _atualizarBarraFiltros();
}

/* =========================
↔️ BARRA DE ROLAGEM DOS FILTROS
A barra nativa dos navegadores é "overlay": no celular ela só aparece
enquanto o dedo arrasta e some logo em seguida, então o cliente não
descobre que existem mais categorias fora da tela. Esta aqui fica
sempre visível quando há transbordo, acompanha a rolagem e pode ser
arrastada com o mouse.
========================= */
function ligarBarraFiltros() {
  return ligarBarraDeRolagem(el("filtros"), el("filtrosBarra"), el("filtrosThumb"));
}

/* A mecânica em si, separada para servir também aos carrosséis de
   produto ("Destaques da semana", "Mais de ..."). Lá o problema é o
   mesmo dos filtros: a barra nativa está escondida por CSS e, no
   celular, ela é overlay — aparece durante o arrasto e some depois.
   Sem uma barra desenhada, o cliente não descobre que existem mais
   produtos para o lado. */
function ligarBarraDeRolagem(trilho, barra, polegar) {
  if (!trilho || !barra || !polegar) return;

  function atualizar() {
    const transbordo = trilho.scrollWidth - trilho.clientWidth;

    // sem categoria escondida não há o que rolar: esconde a barra
    if (transbordo <= 1) {
      barra.classList.remove("ativa");
      return;
    }
    barra.classList.add("ativa");

    const larguraTrilho = barra.clientWidth;
    const proporcao = trilho.clientWidth / trilho.scrollWidth;
    const larguraPolegar = Math.max(26, Math.round(larguraTrilho * proporcao));
    const avanco = trilho.scrollLeft / transbordo;              // 0 → 1
    const deslocamento = Math.round((larguraTrilho - larguraPolegar) * avanco);

    polegar.style.width = larguraPolegar + "px";
    polegar.style.transform = `translateX(${deslocamento}px)`;
  }

  trilho.addEventListener("scroll", atualizar, { passive: true });
  window.addEventListener("resize", atualizar);

  // arrastar a barra rola os filtros junto
  let arrastando = false;

  function moverPara(clienteX) {
    const caixa = barra.getBoundingClientRect();
    const larguraPolegar = polegar.offsetWidth;
    const util = caixa.width - larguraPolegar;
    if (util <= 0) return;

    const pos = clienteX - caixa.left - larguraPolegar / 2;
    const avanco = Math.min(1, Math.max(0, pos / util));
    trilho.scrollLeft = avanco * (trilho.scrollWidth - trilho.clientWidth);
  }

  barra.addEventListener("pointerdown", ev => {
    arrastando = true;
    barra.classList.add("arrastando");
    barra.setPointerCapture(ev.pointerId);
    moverPara(ev.clientX);
  });

  barra.addEventListener("pointermove", ev => {
    if (arrastando) moverPara(ev.clientX);
  });

  const soltar = ev => {
    if (!arrastando) return;
    arrastando = false;
    barra.classList.remove("arrastando");
    if (ev.pointerId != null && barra.hasPointerCapture(ev.pointerId)) {
      barra.releasePointerCapture(ev.pointerId);
    }
  };

  barra.addEventListener("pointerup", soltar);
  barra.addEventListener("pointercancel", soltar);

  atualizar();
  return atualizar;
}

/* Coloca uma barra de rolagem embaixo de cada carrossel de produtos que
   ainda não tenha uma.

   É chamada depois de cada render porque os carrosséis nascem em
   momentos diferentes: os destaques na carga, as seções de categoria
   conforme o cliente rola, e os relacionados só na página de produto.
   Marcar o trilho com dataset.barraLigada deixa a função repetível —
   chamar duas vezes no mesmo carrossel não cria barra duplicada.

   A barra também se atualiza quando o carrossel muda de tamanho, o que
   acontece quando as fotos terminam de carregar e empurram a largura. */
function ligarBarrasDosCarrosseis(raiz = document) {
  raiz.querySelectorAll(".scroll-horizontal").forEach(trilho => {
    if (trilho.dataset.barraLigada) return;
    trilho.dataset.barraLigada = "1";

    const barra = document.createElement("div");
    barra.className = "scroll-barra";
    barra.setAttribute("aria-hidden", "true");

    const polegar = document.createElement("span");
    polegar.className = "scroll-barra-thumb";
    barra.appendChild(polegar);

    trilho.insertAdjacentElement("afterend", barra);

    const atualizar = ligarBarraDeRolagem(trilho, barra, polegar);

    if (atualizar && typeof ResizeObserver !== "undefined") {
      new ResizeObserver(atualizar).observe(trilho);
    }
  });
}

let _atualizarBarraFiltros = null;

function marcarChipAtivo(chave) {
  document.querySelectorAll("#filtros button").forEach(btn => {
    btn.classList.toggle("ativo", btn.dataset.categoria === chave);
  });
}

function filtrarCategoria(familiaId) {
  categoriaAtual = familiaId || "todas";
  modoOfertas = false;
  termoBusca = "";
  const campoBusca = el("busca");
  if (campoBusca) campoBusca.value = "";

  marcarChipAtivo(categoriaAtual);
  aplicarFiltro();

  if (categoriaAtual !== "todas") {
    el("produtos")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

/* volta da tela de resultado para a vitrine: limpa categoria, busca e
   ofertas de uma vez, e sobe a página — o cliente estava lá embaixo na
   lista, e a vitrine começa de cima. */
function voltarParaVitrine() {
  categoriaAtual = "todas";
  modoOfertas = false;
  termoBusca = "";

  const campoBusca = el("busca");
  if (campoBusca) campoBusca.value = "";

  marcarChipAtivo("todas");
  aplicarFiltro();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* mostra só os produtos em oferta no grid principal */
function verOfertas() {
  modoOfertas = true;
  categoriaAtual = "todas";
  termoBusca = "";

  const campoBusca = el("busca");
  if (campoBusca) campoBusca.value = "";

  marcarChipAtivo("ofertas");
  aplicarFiltro();
  el("produtos")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* =========================
🔎 BUSCA E ORDENAÇÃO
========================= */
function buscar() {
  clearTimeout(timeoutBusca);
  modoOfertas = false;
  termoBusca = normalizar(el("busca")?.value || "");
  aplicarFiltro();
  // tocar em Buscar é o cliente dizendo que terminou de digitar
  enviarBuscaPendente();
  el("produtos")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function ordenar(lista) {
  const copia = [...lista];
  if (ordenacao === "menor-preco") return copia.sort((a, b) => a.preco - b.preco);
  if (ordenacao === "maior-preco") return copia.sort((a, b) => b.preco - a.preco);
  if (ordenacao === "desconto")    return copia.sort((a, b) => b.desconto - a.desconto);
  if (ordenacao === "nome")        return copia.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return copia;
}

function aplicarFiltro() {
  produtosFiltrados = ordenar(produtos.filter(p => {
    if (modoOfertas && !p.emOferta) return false;
    if (!modoOfertas && categoriaAtual !== "todas" && p.familia !== categoriaAtual) return false;
    if (termoBusca && !p.busca.includes(termoBusca)) return false;
    return true;
  }));

  // aqui, e só aqui, existem as duas metades ao mesmo tempo: o que foi
  // digitado e quantos produtos aquilo achou
  anotarBusca(termoBusca, produtosFiltrados.length);

  const modoHome = estaNaHome();

  const boxCategorias = el("categoriasHome");
  const boxProdutos = el("produtos");

  if (boxCategorias) boxCategorias.style.display = modoHome ? "block" : "none";
  if (boxProdutos) boxProdutos.style.display = modoHome ? "none" : "grid";

  // Vitrine e resultado são telas diferentes. Quem escolheu uma categoria
  // já disse o que quer ver: ofertas do dia e destaques da semana viram
  // ruído no meio do caminho, e empurram o primeiro produto para fora da
  // tela. Ficam só o cabeçalho, os filtros e os produtos da categoria.
  const banner = document.querySelector(".banner");
  const destaques = document.querySelector(".mais-vendidos");

  if (destaques) destaques.style.display = modoHome ? "" : "none";

  if (banner) {
    // o banner some sozinho quando não há oferta nenhuma no catálogo —
    // voltar para a vitrine não pode ressuscitá-lo vazio
    const temSlide = !!banner.querySelector(".banner-slide");
    banner.style.display = (modoHome && temSlide) ? "" : "none";
  }

  const barra = el("barraResultado");
  if (barra) {
    if (modoHome) {
      barra.style.display = "none";
    } else {
      barra.style.display = "flex";
      const rotulo = modoOfertas
        ? "Ofertas"
        : termoBusca
          ? `Resultados para "${(el("busca")?.value || "").trim()}"`
          : nomeFamilia(categoriaAtual);
      el("resultadoTitulo").textContent = rotulo;
      el("resultadoContagem").textContent =
        `${produtosFiltrados.length} ${produtosFiltrados.length === 1 ? "produto" : "produtos"}`;
    }
  }

  pagina = 0;
  if (boxProdutos) boxProdutos.innerHTML = "";
  if (!modoHome) renderMais();
}

/* =========================
🧾 CARD (grid e versão compacta dos carrosséis)
========================= */
/* A parte de baixo do card, que tem três estados:

     exige receita      -> WhatsApp da farmacêutica
     nada no carrinho   -> botão "Adicionar"
     já está no carrinho -> stepper com a quantidade

   O stepper não aparece mais marcando zero. Ele dizia "0" e oferecia um
   botão de menos que não fazia nada, ocupando justamente o lugar onde
   deveria estar a ação principal do card. Botão e stepper têm a mesma
   altura, então a troca entre eles não mexe no tamanho do card.

   Fica separado do cardHTML porque o atualizarQtdNaTela redesenha só este
   pedaço quando a quantidade muda — os dois precisam gerar o mesmo HTML. */
function acoesDoCardHTML(p, qtd, mini = false) {
  const nome = esc(p.nome);
  const codigo = esc(p.codigo);

  /* Vem antes de tudo, inclusive do stepper: até aqui o card mostrava
     "Adicionar" mesmo com estoque zero, e o pedido só esbarrava na
     realidade no WhatsApp, com o cliente já esperando o produto.

     Quem pode ser encomendado ganha um caminho; quem está zerado de
     propósito só avisa. Prometer encomenda de item descontinuado seria
     trocar uma frustração por outra. */
  if (semEstoque(p)) {

    if (p.encomenda) {
      return `<button class="btn-encomendar" data-acao="encomendar" data-codigo="${codigo}"
                      aria-label="Encomendar ${nome} pelo WhatsApp">
                ${icone("whats", mini ? 12 : 13)}Encomendar
              </button>`;
    }

    return `<button class="btn-esgotado" disabled
                    aria-label="${nome} está indisponível">
              Indisponível
            </button>`;
  }

  if (BLOQUEAR_CONTROLADOS && p.exigeReceita) {
    return `<button class="btn-receita" data-acao="receita" data-codigo="${codigo}">
              ${icone("whats", 13)}Falar com a farmacêutica
            </button>`;
  }

  if (qtd > 0) {
    // na última unidade o "−" vira lixeira: tirar o único item não é
    // diminuir quantidade, é remover o produto do carrinho
    const remover = qtd === 1
      ? { simbolo: icone("trash", mini ? 12 : 13), rotulo: `Remover ${nome} do carrinho` }
      : { simbolo: "−", rotulo: `Remover uma unidade de ${nome}` };

    return `<div class="${mini ? "controle-mini" : "controle"}">
              <button data-acao="menos" data-codigo="${codigo}" aria-label="${remover.rotulo}">${remover.simbolo}</button>
              <span aria-live="polite">${qtd}</span>
              <button data-acao="mais" data-codigo="${codigo}" aria-label="Adicionar uma unidade de ${nome}">+</button>
            </div>`;
  }

  return `<button class="btn-add" data-acao="mais" data-codigo="${codigo}"
                  aria-label="Adicionar ${nome} ao carrinho">
            ${icone("cart-add", mini ? 14 : 15)}Adicionar
          </button>`;
}

function cardHTML(p, mini = false) {
  const qtd = carrinho.find(i => String(i.codigo) === String(p.codigo))?.qtd || 0;
  const nome = esc(p.nome);
  const codigo = esc(p.codigo);
  const href = `produto.html?codigo=${encodeURIComponent(p.codigo)}`;

  // A faixa fica numa tira no topo do card, e não flutuando sobre a foto:
  // cabe o texto inteiro sem tapar o produto, e a foto de todos os cards
  // da fileira começa na mesma altura (por isso a tira vazia).
  //
  // Receita ganha da oferta porque muda o que o cliente precisa fazer.
  // O desconto não some mais nesse caso: ele saiu daqui e virou a pílula
  // ao lado do preço riscado, que aparece nas duas situações.
  /* Estoque ganha da receita e da oferta: não adianta dizer que está 20%
     mais barato se não dá para levar. */
  /* A tira só fala de receita quando ela muda o que o cliente tem que
     FAZER — ou seja, no mesmo recorte do checkout (confirmarReceita).

     Antes ela saía para receitaRemota, que é a tarja vermelha inteira, e
     dizia "Com receita". Numa vitrine, ao lado do preço, isso é lido como
     "não dá para comprar aqui" — e um losartana de uso contínuo vende
     pelo site sem nenhum passo extra. A informação não sumiu: continua na
     página do produto, onde há espaço para explicar em vez de alarmar.

     "Envie a receita" no lugar de "Com receita" pelo mesmo motivo: diz o
     que fazer, não em que categoria o remédio se encaixa. */
  const faixa = semEstoque(p)
    ? `<div class="faixa faixa-indisponivel">Indisponível no momento</div>`
    : p.exigeReceita
    ? `<div class="faixa faixa-receita">${icone("receita", 11)}Retém receita</div>`
    : p.confirmarReceita
      ? `<div class="faixa faixa-controle">${icone("receita", 11)}Envie a receita</div>`
      : p.emOferta
        ? `<div class="faixa faixa-oferta">${icone("tag", 11)}Oferta</div>`
        : `<div class="faixa faixa-vazia" aria-hidden="true"></div>`;

  // Quem fabrica, abaixo do nome. É o que separa dois genéricos de mesmo
  // princípio ativo com preços diferentes — no card antigo essa informação
  // só existia na página do produto.
  const fabricante = esc(p.marca || p.laboratorio || "");
  const linhaMarca = mini
    ? ""
    : `<div class="card-marca">${fabricante || "&nbsp;"}</div>`;

  // A linha do preço antigo sai vazia quando não há desconto, em vez de não
  // sair: assim o preço fica na mesma altura em todos os cards da fileira,
  // e não sobe no card sem oferta. Quem reserva a altura é o CSS.
  const bloco = p.emOferta
    ? `<div class="preco-linha-de">
         <span class="preco-de">${fmt(p.precoOriginal)}</span>
         <span class="preco-desconto">−${p.desconto}%</span>
       </div>
       <span class="preco preco-por">${precoGrandeHTML(p.preco)}</span>`
    : `<div class="preco-linha-de" aria-hidden="true"></div>
       <span class="preco">${precoGrandeHTML(p.preco)}</span>`;

  const acoes = acoesDoCardHTML(p, qtd, mini);

  return `
    <div class="${mini ? "card-mini" : "card"}${semEstoque(p) ? " card-indisponivel" : ""}" data-codigo="${codigo}">
      ${faixa}
      <a class="produto-foto" href="${href}" tabindex="-1" aria-hidden="true">
        <img src="${esc(imagemDe(p))}"
             onerror="this.onerror=null;this.src='${esc(svgDe(p))}'"
             alt="" loading="lazy">
      </a>
      <div class="produto-nome-wrap"><a class="produto-nome-link" href="${href}">${nome}</a></div>
      ${linhaMarca}
      <div class="card-preco">${bloco}</div>
      ${acoes}
    </div>
  `;
}

const cardMiniHTML = p => cardHTML(p, true);

/* =========================
📦 RENDER PRODUTOS (grid principal)
========================= */
function renderMais() {
  const container = el("produtos");
  if (!container || carregando) return;

  carregando = true;

  const inicio = pagina * POR_PAGINA;
  const slice = produtosFiltrados.slice(inicio, inicio + POR_PAGINA);

  if (slice.length === 0 && pagina === 0) {
    container.innerHTML = `
      <div class="aviso-vazio">
        <p>Nenhum produto encontrado.</p>
        <p class="aviso-vazio-sub">Tente outro termo — dá para buscar pela marca, pelo laboratório ou pelo código de barras.</p>
      </div>`;
    carregando = false;
    return;
  }

  const molde = document.createElement("div");
  molde.innerHTML = slice.map(p => cardHTML(p, false)).join("");
  while (molde.firstElementChild) container.appendChild(molde.firstElementChild);

  pagina++;
  carregando = false;
}

/* =========================
🔥 MAIS VENDIDOS
========================= */
function renderMaisVendidos() {
  const container = el("listaMaisVendidos");
  if (!container) return;
  container.innerHTML = maisVendidos.map(cardMiniHTML).join("");
  ligarBarrasDosCarrosseis(container.parentElement || document);
}

/* =========================
🗂️ SEÇÕES POR FAMÍLIA (home)
Só as primeiras já vêm montadas; as demais entram conforme o cliente rola.
========================= */
function renderCategoriasHome() {
  const container = el("categoriasHome");
  if (!container) return;

  const MAX_ITENS_PREVIA = 12;

  // agrupamento numa passada só (antes era um filter dentro de um map,
  // varrendo os 5 mil produtos uma vez por categoria)
  const porFamilia = new Map();
  produtos.forEach(p => {
    if (!porFamilia.has(p.familia)) porFamilia.set(p.familia, []);
    porFamilia.get(p.familia).push(p);
  });

  const blocos = familiasComProdutos()
    .map(f => ({ ...f, itens: porFamilia.get(f.id) || [] }))
    .filter(b => b.itens.length >= 4);

  container.innerHTML = blocos.map(({ id, nome, itens }, i) => `
    <section class="categoria-bloco" aria-label="${esc(nome)}" data-familia="${esc(id)}">
      <div class="categoria-bloco-header">
        <h2>${esc(nome)} <span class="categoria-contador">${itens.length}</span></h2>
        <button class="ver-tudo" data-acao="filtrar" data-familia="${esc(id)}">
          Ver tudo ${icone("chevron-right", 12)}
        </button>
      </div>
      <div class="scroll-horizontal">
        ${i < SECOES_INICIAIS ? itens.slice(0, MAX_ITENS_PREVIA).map(cardMiniHTML).join("") : ""}
      </div>
    </section>
  `).join("");

  ligarBarrasDosCarrosseis(container);

  // monta as seções restantes quando elas chegam perto da tela
  const pendentes = blocos.slice(SECOES_INICIAIS);
  if (!pendentes.length || !("IntersectionObserver" in window)) return;

  const obs = new IntersectionObserver((entradas, observador) => {
    entradas.forEach(entrada => {
      if (!entrada.isIntersecting) return;
      const secao = entrada.target;
      const bloco = blocos.find(b => b.id === secao.dataset.familia);
      const trilho = secao.querySelector(".scroll-horizontal");
      if (bloco && trilho && !trilho.children.length) {
        trilho.innerHTML = bloco.itens.slice(0, MAX_ITENS_PREVIA).map(cardMiniHTML).join("");
        ligarBarrasDosCarrosseis(secao);
      }
      observador.unobserve(secao);
    });
  }, { rootMargin: "400px 0px" });

  pendentes.forEach(b => {
    const secao = container.querySelector(`[data-familia="${CSS.escape(b.id)}"]`);
    if (secao) obs.observe(secao);
  });
}

/* =========================
🔄 SINCRONIZAR QUANTIDADE NA TELA
========================= */
function atualizarQtdNaTela(codigo) {
  const qtd = carrinho.find(i => String(i.codigo) === String(codigo))?.qtd || 0;
  const p = produtos.find(i => String(i.codigo) === String(codigo));
  const chave = CSS.escape(String(codigo));

  // Nos cards não dá mais para trocar só o número: em 0 o bloco é um botão
  // "Adicionar", em 1 é o stepper com lixeira, em 2 ou mais é o stepper
  // comum. Redesenha o bloco inteiro a partir do mesmo gerador do card.
  document.querySelectorAll(`.card[data-codigo="${chave}"], .card-mini[data-codigo="${chave}"]`)
    .forEach(card => {
      const mini = card.classList.contains("card-mini");
      const bloco = card.querySelector(".btn-add, .controle, .controle-mini, .btn-receita, .btn-encomendar, .btn-esgotado");
      if (!bloco || !p) return;

      // se o foco estava aqui dentro, ele se perde ao trocar o HTML —
      // devolve para o botão equivalente, senão quem navega por teclado
      // volta para o começo da página a cada clique
      const tinhaFoco = bloco.contains(document.activeElement)
        ? document.activeElement.dataset.acao
        : null;

      bloco.outerHTML = acoesDoCardHTML(p, qtd, mini);

      if (tinhaFoco) {
        card.querySelector(`[data-acao="${tinhaFoco}"]`)?.focus();
      }
    });

  /* A página de produto tem o bloco dela, com outro desenho, e agora ele
     também troca de forma: em 0 é o botão "Adicionar ao carrinho", em 1
     ou mais é o contador. Trocar só o número deixaria o botão e o
     contador na tela ao mesmo tempo, que era o comportamento antigo.
     Quem sabe desenhar isso é o produto.js, que só existe naquela
     página — daí a checagem. */
  if (document.querySelector(`.produto-detalhe[data-codigo="${chave}"]`)
      && typeof repintarAcoesDoDetalhe === "function" && p) {
    repintarAcoesDoDetalhe(p, qtd);
  }
}

/* =========================
🛒 CARRINHO — adicionar / remover
========================= */
function mais(codigo) {
  const p = produtos.find(i => String(i.codigo) === String(codigo));
  if (!p) return;

  if (BLOQUEAR_CONTROLADOS && p.exigeReceita) return falarSobreReceita(codigo);

  /* Porta única: todo caminho que põe item no carrinho passa por aqui —
     o card, a página do produto e o carrossel de ofertas, que tem botão
     próprio e escaparia de uma checagem feita só no card.
     Não fica em silêncio: sem estoque com encomenda vira conversa no
     WhatsApp, e o resto explica por que nada aconteceu. */
  if (semEstoque(p)) {
    if (p.encomenda) return encomendarProduto(codigo);
    toast(`${p.nome} está indisponível no momento.`);
    return;
  }

  const item = carrinho.find(i => String(i.codigo) === String(codigo));

  if (item) item.qtd++;
  else carrinho.push({ codigo: p.codigo, ean: p.ean, nome: p.nome, preco: p.preco, imagem: p.imagem, qtd: 1 });

  atualizarQtdNaTela(codigo);
  salvar();
}

function menos(codigo) {
  const item = carrinho.find(i => String(i.codigo) === String(codigo));
  if (!item) return;

  item.qtd--;
  if (item.qtd <= 0) carrinho = carrinho.filter(i => String(i.codigo) !== String(codigo));

  atualizarQtdNaTela(codigo);
  salvar();
}

/* medicamento que exige receita: leva a conversa para o WhatsApp da loja */
/* Encomenda: o produto não está na prateleira, mas a loja consegue
   trazer. O pedido sai pelo WhatsApp porque é conversa — prazo e preço
   dependem do distribuidor, e nada disso cabe num botão de carrinho. */
function encomendarProduto(codigo) {
  const p = produtos.find(i => String(i.codigo) === String(codigo));

  if (!p) return abrirWhatsApp("Olá! Gostaria de encomendar um produto que vi no site.");

  abrirWhatsApp(
    `Olá! Vi no site que *${p.nome}* (Cód. ${p.codigo}) está indisponível. ` +
    `Vocês conseguem encomendar?`
  );
}

function falarSobreReceita(codigo) {
  const p = produtos.find(i => String(i.codigo) === String(codigo));
  if (!p) return abrirWhatsApp("Olá! Gostaria de falar com a farmacêutica sobre um medicamento com receita.");

  // tarja preta: a receita fica retida e a retirada é presencial. Dizer
  // isso já na primeira mensagem evita o cliente esperar por uma entrega.
  const texto = p.tarja === "P"
    ? `Olá! Gostaria de saber sobre *${p.nome}* (Cód. ${p.codigo}). Sei que é tarja preta e que preciso levar a receita à loja.`
    : `Olá! Gostaria de saber sobre *${p.nome}* (Cód. ${p.codigo}). Sei que precisa de receita.`;
  abrirWhatsApp(texto);
}

/* Código de barras do item do pedido.

   Vem do próprio item do carrinho, mas com o catálogo como reserva: quem
   já tinha carrinho salvo antes desta mudança guardou item sem EAN, e o
   pedido dessa pessoa não pode sair sem o código. Normalmente o
   reconciliarCarrinho já preencheu na carga; isto cobre o caso de ele não
   ter rodado (catálogo fora do ar, por exemplo). */
function eanDoItem(item) {
  if (item.ean) return item.ean;

  if (typeof produtos === "undefined") return "";

  const p = produtos.find(x => String(x.codigo) === String(item.codigo));

  return p?.ean || "";
}

/* Acima disto o WhatsApp começa a cortar o texto preenchido pelo link.
   Não é número documentado; 2.000 é o patamar que se sustenta nos clientes
   antigos de Android, que são justamente os que cortam mais cedo. */
const LIMITE_URL_WHATSAPP = 2000;

function tamanhoDaURL(texto) {
  return `https://wa.me/${WHATS_LOJA}?text=${encodeURIComponent(texto)}`.length;
}

/* Número do pedido: 9 dígitos, sem letra nenhuma.

   Não é sorteio puro, e não podia ser. Este número é chave primária do
   histórico e é o que casa o WhatsApp com a planilha: dois pedidos com o
   mesmo número fariam um sobrescrever o outro sem ninguém perceber. Com
   6 dígitos sorteados isso acontece em 39% dos casos já no milésimo
   pedido; mesmo com 8, chega a 39% em dez mil.

   Então: 3 dígitos sorteados na frente, e atrás os 6 últimos dígitos do
   relógio em segundos. A parte do relógio não repete por 11 dias, e a
   sorteada quebra o empate de dois pedidos no mesmo segundo — em
   simulação de um ano a 200 pedidos por dia, deu zero a seis colisões.

   Os dígitos sorteados vêm primeiro de propósito: com o relógio na
   frente, pedidos seguidos sairiam quase iguais (369537447, 369544900) e
   pareceriam sequenciais. */
function gerarNumeroDoPedido() {
  const sorteio = Math.floor(Math.random() * 1000);
  const relogio = Math.floor(Date.now() / 1000) % 1000000;

  return String(sorteio).padStart(3, "0") + String(relogio).padStart(6, "0");
}

function abrirWhatsApp(texto) {
  const url = `https://wa.me/${WHATS_LOJA}?text=${encodeURIComponent(texto)}`;
  const janela = window.open(url, "_blank");
  return { url, abriu: !!janela };
}

function salvar() {
  try {
    localStorage.setItem("carrinho", JSON.stringify(carrinho));
  } catch (e) {
    console.warn("Não foi possível salvar o carrinho.", e);
  }
  renderCarrinho();
  atualizarTotais();
}

function limparCarrinho() {
  carrinho = [];

  document.querySelectorAll("[data-codigo]").forEach(card => {
    const span = card.querySelector(".controle span, .controle-mini span");
    if (span) span.textContent = "0";
  });

  const check = el("confirmaReceita");
  if (check) check.checked = false;

  el("linkPedido")?.remove();
  resetarFrete();
  salvar();
}

/* =========================
📋 RENDER LISTA DO CARRINHO
========================= */
function renderCarrinho() {
  const container = el("itens");
  if (!container) return;

  /* Na página do carrinho, o formulário inteiro some quando não há o que
     comprar: pedir nome, telefone e CEP para um carrinho vazio é um beco
     sem saída. Quem manda na tela nesse caso é o "Continuar comprando". */
  const bloco = el("blocoCheckout");
  if (bloco) bloco.hidden = !carrinho.length;

  if (!carrinho.length) {
    container.innerHTML = `<p class="carrinho-vazio">Seu carrinho está vazio</p>`;
    atualizarAvisoControleEspecial();
    return;
  }

  container.innerHTML = carrinho.map(p => `
    <div class="item">
      <div class="item-info">
        <b>${esc(p.nome)}</b>
        <small>${fmt(p.preco)} cada</small>
      </div>
      <div class="item-qtd">
        <button class="qtd-btn" data-acao="menos" data-codigo="${esc(p.codigo)}" aria-label="Remover uma unidade de ${esc(p.nome)}">−</button>
        <span>${p.qtd}</span>
        <button class="qtd-btn" data-acao="mais" data-codigo="${esc(p.codigo)}" aria-label="Adicionar uma unidade de ${esc(p.nome)}">+</button>
      </div>
    </div>
  `).join("");

  atualizarAvisoControleEspecial();
}

/* =========================
📋 CONTROLE ESPECIAL NO CARRINHO (Portaria 344, listas C)
Itens destas listas entram no carrinho normalmente, mas a lei só permite
entrega remota se a receita for conferida antes do envio (Art. 34-B) - o
site não consegue anexar a foto sozinho num link wa.me, então quem garante
isso é o cliente, confirmando aqui que vai enviar a receita pelo WhatsApp
depois de finalizar o pedido (conforme o POP de entregas remotas da loja).
========================= */
function itensDeControleEspecialNoCarrinho() {
  return carrinho
    .map(item => ({ item, p: produtos.find(x => String(x.codigo) === String(item.codigo)) }))
    .filter(({ p }) => p && p.confirmarReceita);
}

function atualizarAvisoControleEspecial() {
  const box = el("avisoControleEspecial");
  if (!box) return;

  const tem = itensDeControleEspecialNoCarrinho().length > 0;
  box.style.display = tem ? "block" : "none";

  // some o item, some a obrigação de confirmar de novo
  if (!tem) {
    const check = el("confirmaReceita");
    if (check) check.checked = false;
  }
}

/* =========================
💰 TOTAIS
========================= */
function subtotalCarrinho() {
  return carrinho.reduce((a, b) => a + b.preco * b.qtd, 0);
}

function valorFreteAtual() {
  const tipo = el("tipoEntrega")?.value;
  if (tipo !== "Entrega" || !freteCalculado) return 0;
  if (FRETE_GRATIS_ACIMA_DE > 0 && subtotalCarrinho() >= FRETE_GRATIS_ACIMA_DE) return 0;
  return freteCalculado.valor;
}

function atualizarTotais() {
  const subtotal = subtotalCarrinho();
  const qtd = carrinho.reduce((a, b) => a + b.qtd, 0);
  const frete = valorFreteAtual();
  const totalGeral = subtotal + frete;

  el("total") && (el("total").textContent = fmt(totalGeral));
  el("qtd") && (el("qtd").textContent = qtd);
  el("qtdTop") && (el("qtdTop").textContent = qtd);
  el("totalTop") && (el("totalTop").textContent = fmt(totalGeral));

  /* Resumo destrinchado — só existe na página do carrinho. Na barra fixa
     da vitrine cabe um número só, e lá o que importa é o total; aqui, na
     hora de confirmar, o cliente quer ver de onde saiu esse total. A
     linha do frete some quando é retirada na loja, para não anunciar uma
     taxa que ninguém vai pagar. */
  el("resumoSubtotal") && (el("resumoSubtotal").textContent = fmt(subtotal));
  el("resumoTotal") && (el("resumoTotal").textContent = fmt(totalGeral));

  const linhaFrete = el("linhaFrete");
  if (linhaFrete) {
    const entregando = el("tipoEntrega")?.value === "Entrega";
    linhaFrete.hidden = !entregando;
    el("resumoFrete") &&
      (el("resumoFrete").textContent = freteCalculado ? fmt(frete) : "a calcular");
  }

  document.querySelector(".header-carrinho")?.classList.toggle("tem-itens", qtd > 0);
  document.body.classList.toggle("carrinho-com-itens", qtd > 0);
}

/* =========================
🚚 TIPO DE ENTREGA
========================= */
function toggleEndereco() {
  const tipo = el("tipoEntrega")?.value;
  const box = el("boxEndereco");
  if (!box) return;

  box.style.display = tipo === "Entrega" ? "flex" : "none";
  if (tipo !== "Entrega") resetarFrete();
  atualizarTotais();
}

/* =========================
📮 CEP — máscara e busca (ViaCEP)
========================= */
/* Telefone com a máscara (11) 98765-4321.

   Celular e fixo não têm o mesmo tamanho — 9 dígitos contra 8 —, então a
   máscara decide pelo que já foi digitado, em vez de forçar um formato
   só. Fixo da loja, com 8, fecha como (11) 4321-8765.

   O valor mascarado não atrapalha nada adiante: o telValido() e o
   soDigitos() do worker já tiram tudo que não é número, e é pelos
   dígitos que o cliente é reconhecido entre um pedido e outro. */
function mascaraTelefone(input) {
  const d = input.value.replace(/\D/g, "").slice(0, 11);

  let v = d;
  if (d.length > 10)     v = d.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3");
  else if (d.length > 6) v = d.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3");
  else if (d.length > 2) v = d.replace(/^(\d{2})(\d{0,5})/, "($1) $2");
  else if (d.length > 0) v = "(" + d;

  input.value = v;
}

function mascaraCEP(input) {
  let v = input.value.replace(/\D/g, "").slice(0, 8);
  if (v.length > 5) v = v.replace(/(\d{5})(\d)/, "$1-$2");
  input.value = v;
}

function limparCamposEndereco() {
  ["endereco", "bairro", "cidade"].forEach(id => { if (el(id)) el(id).value = ""; });
}

/* Rua, bairro e cidade nascem bloqueados porque, quando o CEP é
   encontrado, deixar digitar só serve para o cliente errar e o entregador
   rodar. Mas a base do ViaCEP não tem todo CEP do Brasil — e quando ela
   não tem, campo bloqueado e vazio vira beco sem saída: o cliente não
   consegue pedir entrega de jeito nenhum, e a loja perde a venda sem
   ficar sabendo por quê.

   Então o bloqueio deixa de ser permanente e passa a seguir o que o CEP
   respondeu. */
function liberarEnderecoManual() {
  ["endereco", "bairro", "cidade"].forEach(id => el(id)?.removeAttribute("readonly"));
  el("endereco")?.focus();
}

function travarEnderecoAutomatico() {
  ["endereco", "bairro", "cidade"].forEach(id => el(id)?.setAttribute("readonly", ""));
}

/* Guarda a busca em andamento para o calcularFrete poder esperá-la.

   Sem isto havia uma corrida: o cliente digita o CEP e toca direto em
   "Calcular taxa de entrega". O toque tira o foco do campo, o que dispara
   esta busca — mas o clique no botão roda antes de a resposta chegar, e
   o frete reclamava "Informe um CEP válido primeiro" com um CEP válido
   na tela. Na segunda tentativa funcionava, o que é o pior tipo de
   defeito: some quando alguém vai conferir. */
let buscaCEPEmAndamento = null;

async function buscarCEP() {
  const cep = el("cep")?.value.replace(/\D/g, "");
  resetarFrete();

  if (!cep || cep.length !== 8) return;

  buscaCEPEmAndamento = (async () => {
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();

      // o ViaCEP devolve a string "true", não o booleano
      if (data.erro) {

        /* Segunda chance antes de desistir: o CEP da raiz, com os três
           últimos dígitos zerados. Ele é o CEP geral daquele pedaço da
           cidade e está na base mesmo quando o da rua não está — o
           09761-181 do cliente não existe lá, mas o 09761-000 existe e
           devolve Baeta Neves, São Bernardo do Campo.

           Isso não adivinha a rua, e nem tenta: preenche bairro e cidade,
           que é o que o cálculo da entrega precisa, e deixa a rua para o
           cliente escrever. */
        const raiz = cep.slice(0, 5) + "000";
        const porRegiao = raiz !== cep
          ? await fetch(`https://viacep.com.br/ws/${raiz}/json/`).then(r => r.json()).catch(() => null)
          : null;

        limparCamposEndereco();
        liberarEnderecoManual();

        if (porRegiao && !porRegiao.erro && porRegiao.localidade) {
          el("bairro").value = porRegiao.bairro || "";
          el("cidade").value = porRegiao.localidade;
          mostrarResultadoFrete(
            `Esse CEP não está na base dos Correios, mas identificamos a região (${porRegiao.bairro || porRegiao.localidade}). Escreva a rua e o número que a gente calcula a entrega.`,
            "erro"
          );
        } else {
          mostrarResultadoFrete(
            "Não encontramos esse CEP na base dos Correios. Preencha a rua, o bairro e a cidade à mão que a gente calcula a entrega do mesmo jeito.",
            "erro"
          );
        }

        return;
      }

      el("endereco").value = data.logradouro || "";
      el("bairro").value = data.bairro || "";
      el("cidade").value = data.localidade || "";

      /* CEP de cidade inteira (os terminados em -000, por exemplo) vem
         sem logradouro. Aí a rua continua sendo o cliente que diz. */
      if (data.logradouro) travarEnderecoAutomatico();
      else liberarEnderecoManual();

      el("numero")?.focus();

    } catch (e) {
      console.error("Erro buscar CEP", e);
      liberarEnderecoManual();
      mostrarResultadoFrete(
        "Não conseguimos consultar o CEP agora. Preencha o endereço à mão que a gente calcula a entrega do mesmo jeito.",
        "erro"
      );
    } finally {
      buscaCEPEmAndamento = null;
    }
  })();

  await buscaCEPEmAndamento;
}

/* =========================
🚚 FRETE (geocodificação + distância)
========================= */
async function geocodificar(params) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=br&limit=1&${params}`;
  const res = await fetch(url, { headers: { "Accept-Language": "pt-BR" } });
  const data = await res.json();

  if (!data.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

/* Tenta achar o endereço do mais preciso pro mais amplo, até conseguir
   coordenadas. O Nominatim é bem exigente com texto livre completo, então é
   melhor ir afrouxando a busca aos poucos do que falhar de primeira. */
/* O OpenStreetMap não tem todas as ruas de São Bernardo. "Rua Paul
   Sousa", por exemplo, não existe lá em nenhuma grafia — conferido nas
   quatro tentativas de rua, todas vazias. Antes disso significar "não
   conseguimos calcular", e o cliente ficar sem poder pedir, a última
   tentativa desce para o nível do bairro.

   Bairro de São Bernardo tem cerca de um quilômetro, e a área de entrega
   tem oito. O erro que isso introduz na conta cabe dentro da faixa, e o
   resultado sai marcado como aproximado — a tela diz que é pela região,
   e a loja confirma no WhatsApp. É melhor do que uma venda perdida por
   causa de um mapa incompleto. */
async function geocodificarComFallback({ numero, endereco, bairro, cidade, cepLimpo }) {
  const tentativas = [
    // nível da porta
    { params: `street=${encodeURIComponent(`${numero} ${endereco}`)}&city=${encodeURIComponent(cidade)}&postalcode=${cepLimpo}` },
    { params: `street=${encodeURIComponent(endereco)}&city=${encodeURIComponent(cidade)}` },
    { params: `postalcode=${cepLimpo}&country=Brasil` },
    { params: `q=${encodeURIComponent(`${endereco}, ${bairro}, ${cidade}, Brasil`)}` },

    // nível da região: não acha a casa, acha o pedaço da cidade
    bairro ? { params: `q=${encodeURIComponent(`${bairro}, ${cidade}, Brasil`)}`, aproximado: true } : null,
    cidade ? { params: `q=${encodeURIComponent(`${cidade}, Brasil`)}`, aproximado: true } : null
  ].filter(Boolean);

  for (const tentativa of tentativas) {
    try {
      const coords = await geocodificar(tentativa.params);
      if (coords) return { ...coords, aproximado: !!tentativa.aproximado };
    } catch (e) {
      console.error("Tentativa de geocodificação falhou", tentativa.params, e);
    }
  }

  return null;
}

function calcularDistanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function mostrarResultadoFrete(msg, tipo) {
  const resultado = el("resultadoFrete");
  if (!resultado) return;

  resultado.textContent = msg;
  resultado.style.display = "block";
  resultado.classList.remove("ok", "erro");
  resultado.classList.add(tipo);
}

function resetarFrete() {
  freteCalculado = null;

  const resultado = el("resultadoFrete");
  if (resultado) {
    resultado.style.display = "none";
    resultado.textContent = "";
    resultado.classList.remove("ok", "erro");
  }

  atualizarTotais();
}

async function calcularFrete() {
  // se o cliente tocou no botão logo depois de digitar o CEP, a consulta
  // ainda está voando; sem esperar, o endereço estaria vazio aqui
  if (buscaCEPEmAndamento) await buscaCEPEmAndamento.catch(() => {});

  const numero = el("numero")?.value.trim();
  const endereco = el("endereco")?.value.trim();
  const bairro = el("bairro")?.value.trim();
  const cidade = el("cidade")?.value.trim();
  const cepLimpo = (el("cep")?.value || "").replace(/\D/g, "");

  if (!endereco || !cidade) return toast("Preencha a rua e a cidade");
  if (!numero) return toast("Informe o número do endereço");

  const btn = el("btnCalcularFrete");
  if (btn) { btn.disabled = true; btn.textContent = "Calculando..."; }

  try {
    const coords = await geocodificarComFallback({ numero, endereco, bairro, cidade, cepLimpo });

    if (!coords) {
      freteCalculado = null;
      mostrarResultadoFrete("Não localizamos esse endereço automaticamente. Fale com a gente pelo WhatsApp para confirmar a entrega.", "erro");
      return;
    }

    const dist = calcularDistanciaKm(LOJA_LAT, LOJA_LNG, coords.lat, coords.lng);

    if (dist > RAIO_MAX_KM) {
      freteCalculado = null;
      mostrarResultadoFrete(`Endereço fora da área de entrega (${dist.toFixed(1)} km). Finalize como retirada e solicite a entrega por aplicativo.`, "erro");
      return;
    }

    const valor = calcularValorFrete(dist);
    freteCalculado = { dist, valor, aproximado: coords.aproximado };

    const gratis = FRETE_GRATIS_ACIMA_DE > 0 && subtotalCarrinho() >= FRETE_GRATIS_ACIMA_DE;
    const base = gratis
      ? `Entrega grátis neste pedido (${dist.toFixed(1)} km)`
      : `Taxa de entrega: ${fmt(valor)} (${dist.toFixed(1)} km)`;

    /* Quando a conta saiu do bairro e não da porta, o cliente precisa
       saber — senão uma diferença na entrega vira discussão no balcão. */
    mostrarResultadoFrete(
      coords.aproximado
        ? `${base}. Valor estimado pela região: não achamos essa rua no mapa, então a farmacêutica confirma a taxa no WhatsApp.`
        : base,
      "ok"
    );
  } catch (e) {
    console.error("Erro calcular frete", e);
    freteCalculado = null;
    mostrarResultadoFrete("Erro ao calcular a taxa de entrega. Tente novamente.", "erro");
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = `${icone("pin", 14)}Calcular taxa de entrega`; }
    atualizarTotais();
  }
}

/* =========================
💳 PAGAMENTO
========================= */
function trocarPagamento() {
  const pagamento = el("pagamento")?.value;
  const box = el("boxTroco");
  if (!box) return;

  if (pagamento === "Dinheiro") {
    box.style.display = "block";
    if (el("trocoInput") && !el("trocoInput").value) el("trocoInput").value = "R$ 0,00";
  } else {
    box.style.display = "none";
    if (el("trocoInput")) el("trocoInput").value = "";
  }
}

function formatarTroco(input) {
  let valor = input.value.replace(/\D/g, "");

  if (!valor) {
    input.value = "R$ 0,00";
    return;
  }

  valor = (parseInt(valor, 10) / 100).toFixed(2);
  input.value = "R$ " + valor.replace(".", ",");
}

/* =========================
🎠 BANNER
========================= */
let _bannerTimer = null;

function iniciarBanner() {
  const slides = document.querySelectorAll(".banner-slide");

  if (_bannerTimer) clearInterval(_bannerTimer);
  if (!slides.length) return;

  slides.forEach(s => s.classList.remove("ativo"));
  slides[0].classList.add("ativo");

  // quem pediu menos animação no sistema não recebe carrossel automático
  const menosMovimento = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (menosMovimento || slides.length < 2) return;

  let i = 0;
  _bannerTimer = setInterval(() => {
    slides[i].classList.remove("ativo");
    i = (i + 1) % slides.length;
    slides[i].classList.add("ativo");
  }, 5000);
}

/* monta o banner com produtos reais em oferta.
   Sem produto em oferta no momento, o banner fica escondido. */
function renderBannerOfertas() {
  const banner = document.querySelector(".banner");
  const container = document.querySelector(".banner-container");
  if (!banner || !container) return;

  const ofertas = produtos
    .filter(p => p.emOferta && !p.exigeReceita && !semEstoque(p))
    .sort((a, b) => b.desconto - a.desconto)
    .slice(0, 12);

  if (!ofertas.length) {
    banner.style.display = "none";
    return;
  }

  banner.style.display = "";

  const grupos = [];
  for (let i = 0; i < ofertas.length; i += 3) grupos.push(ofertas.slice(i, i + 3));

  container.innerHTML = grupos.map(grupo => `
    <div class="banner-slide banner-slide-grupo">
      <div class="banner-topo">
        <span class="banner-badge">${icone("tag", 11)}Ofertas do dia</span>
        <button class="banner-vertudo" data-acao="ofertas">Ver todas ${icone("chevron-right", 11)}</button>
      </div>
      <div class="banner-grupo-itens">
        ${grupo.map(p => `
          <button class="banner-item" data-acao="banner" data-codigo="${esc(p.codigo)}"
                  aria-label="Adicionar ${esc(p.nome)} ao carrinho">
            <span class="banner-item-img-wrap">
              <img src="${esc(imagemDe(p))}"
                   onerror="this.onerror=null;this.src='${esc(svgDe(p))}'"
                   alt="" loading="lazy">
              <span class="banner-item-add" aria-hidden="true">+</span>
            </span>
            <b>${esc(p.nome)}</b>
            <span class="banner-item-de">${fmt(p.precoOriginal)}</span>
            <span class="banner-item-por">${fmt(p.preco)}</span>
          </button>
        `).join("")}
      </div>
    </div>
  `).join("");

  iniciarBanner();
}

/* clique em um item do banner: adiciona direto no carrinho.

   Antes isto também escancarava a gaveta do carrinho. Agora o carrinho é
   uma página, e mandar o cliente para lá a cada item do banner o tiraria
   da vitrine bem no momento em que ele está comprando. A barra de baixo
   já confirma que o item entrou, e o "Ver carrinho" fica a um toque. */
function adicionarDoBanner(codigo) {
  const p = produtos.find(i => String(i.codigo) === String(codigo));
  mais(codigo);

  if (p && !(BLOQUEAR_CONTROLADOS && p.exigeReceita)) {
    toast(`${p.nome} adicionado`);
  }
}

/* =========================
📦 FINALIZAR PEDIDO
========================= */
function finalizar() {
  if (!carrinho.length) return toast("Carrinho vazio");

  /* Trava de segurança, e não checagem de conveniência.

     Quem decide se o pedido exige receita é itensDeControleEspecialNoCarrinho(),
     que cruza o carrinho com o catálogo. Com o catálogo fora do ar essa
     função devolve lista vazia — ou seja, um pedido de antibiótico
     passaria SEM a confirmação da receita, em silêncio, e ninguém na loja
     saberia. Falhar calado do lado errado da Portaria 344 não é opção.

     Some daqui também a conferência de preço que o reconciliarCarrinho
     faz: sem catálogo, o valor no carrinho é o que estava guardado no
     aparelho, que pode ser de antes de um reajuste. */
  if (!produtos.length) {
    return toast("Não conseguimos conferir o catálogo agora. Recarregue a página e tente de novo.");
  }

  const itensControleEspecial = itensDeControleEspecialNoCarrinho();

  if (itensControleEspecial.length && !el("confirmaReceita")?.checked) {
    el("avisoControleEspecial")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return toast("Confirme o envio da receita para finalizar");
  }

  const nome = el("nome")?.value.trim();
  const telefone = el("telefone")?.value.trim();
  const tipoEntrega = el("tipoEntrega")?.value;
  const pagamento = el("pagamento")?.value;

  if (!nome) return toast("Informe seu nome");
  if (!telValido(telefone || "")) return toast("Informe um telefone válido");
  if (!pagamento) return toast("Escolha a forma de pagamento");

  let enderecoTexto = "";

  if (tipoEntrega === "Entrega") {
    const numero = el("numero")?.value.trim();
    const endereco = el("endereco")?.value.trim();
    const bairro = el("bairro")?.value.trim();
    const cidade = el("cidade")?.value.trim();
    const cep = el("cep")?.value.trim();

    if (!endereco || !numero) return toast("Preencha o endereço completo");
    if (!freteCalculado) return toast("Calcule a taxa de entrega antes de finalizar");

    enderecoTexto = `${endereco}, ${numero} - ${bairro}, ${cidade} - CEP ${cep}`;
  }

  let trocoTexto = "";
  if (pagamento === "Dinheiro") {
    const valorTroco = Number(
      (el("trocoInput")?.value || "")
        .replace("R$", "")
        .replace(/\s/g, "")
        .replace(/\./g, "")
        .replace(",", ".")
    ) || 0;
    if (valorTroco > 0) trocoTexto = `\nTroco para: ${fmt(valorTroco)}`;
  }

  const subtotal = subtotalCarrinho();
  const frete = tipoEntrega === "Entrega" ? valorFreteAtual() : 0;
  const totalGeral = subtotal + frete;

  // código curto para casar o WhatsApp com a linha da planilha
  const ref = gerarNumeroDoPedido();

  const montarMensagem = (comCodigos) => {

    let m = `🛒 NOVO PEDIDO — ${ref}\n\n`;

    carrinho.forEach(p => {
      m += `${p.qtd}x ${p.nome} - ${fmt(p.preco * p.qtd)}\n`;

      if (!comCodigos) return;

      // Código e código de barras numa linha só embaixo, e não no fim da
      // linha do produto: no celular o WhatsApp quebra a linha onde couber,
      // e um EAN partido no meio não dá para bipar nem copiar.
      //
      // Texto sem acento e sem "·" de propósito: isto tudo viaja dentro de
      // uma URL, onde cada um deles ocupa 6 caracteres. Num pedido de 20
      // itens a diferença passa de 300 caracteres.
      const ean = eanDoItem(p);
      m += ` Cod ${p.codigo}${ean ? ` EAN ${ean}` : ""}\n`;
    });

    if (!comCodigos) {
      m += `\n_Pedido longo: os códigos de barras foram para a planilha, na referência ${ref}._\n`;
    }

    m += `\nSubtotal: ${fmt(subtotal)}`;
    if (tipoEntrega === "Entrega") m += `\nTaxa de entrega: ${fmt(frete)}`;
    m += `\n*TOTAL: ${fmt(totalGeral)}*\n`;

    m += `\n👤 ${nome}`;
    m += `\n📞 ${telefone}`;
    m += `\n${tipoEntrega === "Entrega" ? "🚚 Entrega" : "🏪 Retirada na loja"}`;
    if (enderecoTexto) m += `\n📍 ${enderecoTexto}`;
    m += `\n💳 ${pagamento}${trocoTexto}`;

    if (itensControleEspecial.length) {
      m += `\n\n📋 *Item(ns) com receita neste pedido - envie a foto da receita aqui no WhatsApp antes da entrega:*`;
      itensControleEspecial.forEach(({ item }) => { m += `\n• ${item.nome}`; });
    }

    return m;
  };

  // A mensagem viaja inteira dentro da URL do wa.me, e o WhatsApp corta o
  // texto passado desse tamanho — calado, no meio da lista. Um pedido
  // grande perderia itens sem ninguém perceber. Quando não couber com os
  // códigos, vai sem eles: a planilha recebe a lista completa de qualquer
  // jeito, então o que se perde é conveniência, não informação.
  let msg = montarMensagem(true);

  if (tamanhoDaURL(msg) > LIMITE_URL_WHATSAPP) msg = montarMensagem(false);

  const pedido = {
    ref,
    cliente: nome,
    telefone,
    entrega: tipoEntrega,
    pagamento,
    subtotal,
    frete,
    total: totalGeral,
    itens: carrinho.map(item => {
      const ean = eanDoItem(item);
      return `${item.qtd}x ${item.nome}${ean ? ` [${ean}]` : ""}`;
    }).join(" | ")
  };

  fetch(API_PEDIDOS, { method: "POST", body: JSON.stringify(pedido) })
    .catch(err => console.error("Erro ao salvar pedido:", err));

  // O mesmo pedido, com os itens em lista, para o histórico no D1. A
  // planilha continua recebendo o formato antigo: os dois convivem até o
  // painel ganhar confiança, e nenhum dos dois depende do outro.
  if (API_PEDIDOS_D1) {
    fetch(`${API_PEDIDOS_D1.replace(/\/+$/, "")}/pedidos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ref,
        cliente: nome,
        telefone,
        entrega: tipoEntrega,
        endereco: enderecoTexto,
        pagamento,
        subtotal,
        frete,
        total: totalGeral,
        temReceita: itensControleEspecial.length > 0,
        itens: carrinho.map(item => ({
          ean: eanDoItem(item),
          codigo: item.codigo,
          descricao: item.nome,
          qtd: item.qtd,
          preco: item.preco
        }))
      })
    }).catch(err => console.error("Erro ao gravar no histórico:", err));
  }

  const { url, abriu } = abrirWhatsApp(msg);

  if (abriu) {
    toast(`Pedido ${ref} enviado!`);
    limparCarrinho();
    mostrarPedidoEnviado(ref, itensControleEspecial.length > 0);
  } else {
    // pop-up bloqueado (comum no iOS): antes o carrinho era limpo aqui
    // e o cliente ficava sem pedido E sem carrinho.
    mostrarLinkPedido(url, ref);
  }
}

/* Tela de "deu certo", só na página do carrinho.

   Na gaveta antiga isso não existia — o WhatsApp abria numa aba nova e,
   quando o cliente voltava, encontrava o carrinho vazio e nenhuma
   explicação. Parecia que o pedido tinha se perdido.

   Aqui ele volta para uma página que confirma o número do pedido e diz o
   que acontece agora. O número importa: é a referência que casa a
   conversa do WhatsApp com a linha do painel da loja. */
function mostrarPedidoEnviado(ref, temReceita) {
  const alvo = el("carrinhoConteudo");
  if (!alvo) return;

  alvo.innerHTML = `
    <div class="pedido-enviado">
      <div class="pedido-enviado-marca">
        <svg class="ic" width="26" height="26" aria-hidden="true"><use href="#ic-check"></use></svg>
      </div>
      <h2>Pedido enviado!</h2>
      <p class="pedido-enviado-ref">Número do pedido: <strong>${esc(ref)}</strong></p>
      <p>Abrimos o WhatsApp da loja com o seu pedido. Se a conversa não apareceu, procure a aba que acabou de abrir e toque em enviar — o pedido só chega até nós depois disso.</p>
      ${temReceita ? `
        <p class="pedido-enviado-receita">
          <strong>Não esqueça da receita.</strong> Envie a foto dela nessa mesma conversa. A entrega só pode sair depois de a farmacêutica conferir.
        </p>
      ` : ""}
      <a class="btn-finalizar" href="index.html">Voltar para a loja</a>
    </div>
  `;

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function mostrarLinkPedido(url, ref) {
  const acoes = document.querySelector(".carrinho-acoes");
  if (!acoes) { window.location.href = url; return; }

  let caixa = el("linkPedido");
  if (!caixa) {
    caixa = document.createElement("div");
    caixa.id = "linkPedido";
    caixa.className = "link-pedido";
    acoes.prepend(caixa);
  }

  caixa.innerHTML = `
    <p>Seu navegador bloqueou a janela do WhatsApp. O carrinho está guardado — toque abaixo para enviar o pedido ${esc(ref)}.</p>
    <a class="btn-finalizar" href="${esc(url)}" target="_blank" rel="noopener">Abrir o WhatsApp</a>
  `;
  caixa.scrollIntoView({ behavior: "smooth", block: "center" });
}

/* =========================
📲 INSTALAR COMO APP
========================= */
/* O Android e o iPhone tratam isso de formas completamente diferentes,
   e o banner precisa dar conta dos dois:

   - Android/Chrome dispara o evento "beforeinstallprompt". Dá para
     segurar esse evento e abrir a janela de instalação de verdade quando
     o cliente tocar no botão.

   - iPhone NÃO tem essa API. A Apple nunca expôs nada equivalente: o
     único caminho é o cliente tocar em Compartilhar e escolher "Adicionar
     à Tela de Início". Então lá o botão não instala nada — ele mostra
     onde ficam esses dois toques.

   Prometer "Instalar" no iPhone e abrir uma janela que não existe seria
   pior do que não ter banner. */

const INSTALAR_CHAVE = "instalar_dispensado_ate";
const INSTALAR_DIAS = 30;   // quem fechou não é perguntado de novo por um mês

let eventoDeInstalacao = null;

/* Fica no topo do arquivo, fora de qualquer DOMContentLoaded: o Chrome
   dispara esse evento cedo e só uma vez. Se o ouvinte não estiver no ar
   na hora, a chance passa e o banner nunca aparece. */
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();          // segura o aviso automático do Chrome
  eventoDeInstalacao = e;      // e guarda para usar no nosso botão
  mostrarBannerInstalar();
});

window.addEventListener("appinstalled", () => {
  eventoDeInstalacao = null;
  el("instalarBanner")?.remove();
  toast("Pronto! O catálogo está na sua tela inicial.");
});

function rodandoComoApp() {
  return window.matchMedia("(display-mode: standalone)").matches ||
         window.navigator.standalone === true;
}

function ehIPhone() {
  // iPad com iPadOS 13+ se apresenta como Mac; o toque é o que entrega
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
         (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function instalarFoiDispensado() {
  try {
    return Date.now() < Number(localStorage.getItem(INSTALAR_CHAVE) || 0);
  } catch {
    return false;   // navegação privada bloqueia o storage; mostra assim mesmo
  }
}

function dispensarInstalar() {
  try {
    localStorage.setItem(
      INSTALAR_CHAVE,
      String(Date.now() + INSTALAR_DIAS * 24 * 60 * 60 * 1000)
    );
  } catch { /* sem storage, volta a aparecer na próxima visita */ }

  el("instalarBanner")?.remove();
}

function mostrarBannerInstalar() {
  if (rodandoComoApp()) return;        // já instalado, não tem o que oferecer
  if (instalarFoiDispensado()) return;
  if (el("instalarBanner")) return;    // já está na tela

  const banner = document.createElement("div");
  banner.id = "instalarBanner";
  banner.className = "instalar-banner";
  banner.setAttribute("role", "dialog");
  banner.setAttribute("aria-label", "Instalar o catálogo");

  const noIPhone = ehIPhone();

  banner.innerHTML = `
    <img class="instalar-icone" src="icone-192.png" alt="" width="44" height="44">

    <div class="instalar-texto">
      <strong>Instale nosso catálogo</strong>
      <p>Fica na tela inicial do celular e abre como aplicativo, sem precisar guardar o link.</p>
      ${noIPhone ? `
        <ol class="instalar-passos" id="instalarPassos" hidden>
          <li>Toque em ${icone("compartilhar", 14)} <strong>Compartilhar</strong>, na barra do navegador.</li>
          <li>Role e escolha <strong>Adicionar à Tela de Início</strong>.</li>
          <li>Confirme em <strong>Adicionar</strong>.</li>
        </ol>` : ""}
    </div>

    <div class="instalar-acoes">
      <button class="instalar-btn" data-acao="instalar">${noIPhone ? "Como faz" : "Instalar"}</button>
      <button class="instalar-fechar" data-acao="dispensar" aria-label="Agora não">✕</button>
    </div>
  `;

  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add("aberto"));

  banner.addEventListener("click", async (e) => {
    const acao = e.target.closest("[data-acao]")?.dataset.acao;

    if (acao === "dispensar") return dispensarInstalar();
    if (acao !== "instalar") return;

    if (noIPhone) {
      // no iPhone o botão só revela o passo a passo, porque instalar
      // depende de um gesto do cliente que nenhum código dispara
      const passos = el("instalarPassos");
      if (passos) {
        passos.hidden = !passos.hidden;
        e.target.textContent = passos.hidden ? "Como faz" : "Entendi";
      }
      return;
    }

    if (!eventoDeInstalacao) return dispensarInstalar();

    eventoDeInstalacao.prompt();
    const { outcome } = await eventoDeInstalacao.userChoice;
    eventoDeInstalacao = null;

    // recusou: não insiste na próxima visita
    if (outcome !== "accepted") dispensarInstalar();
    else el("instalarBanner")?.remove();
  });
}

/* O iPhone nunca dispara beforeinstallprompt, então lá o banner precisa
   ser chamado na mão. Com folga, para não competir com o carregamento do
   catálogo nem aparecer antes de o cliente ver o que a loja vende. */
document.addEventListener("DOMContentLoaded", () => {
  if (!ehIPhone()) return;
  setTimeout(mostrarBannerInstalar, 4000);
});

/* O service worker é requisito do Chrome para oferecer a instalação, e
   de quebra deixa a casca do site abrir sem rede. Ele não guarda preço
   nem tarja — ver os comentários no sw.js. */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((erro) => {
      console.warn("Service worker não registrou; o site funciona igual.", erro);
    });
  });
}

/* =========================
🔎 O QUE OS CLIENTES PROCURAM
========================= */
/* Registra o termo digitado na busca, para o painel da loja responder
   duas perguntas que o histórico de pedidos não responde:

     - o que procuram muito (e precisa estar sempre em estoque)
     - o que procuram e NÃO acham (o que falta no catálogo)

   A segunda é a que vale dinheiro: é uma venda que não aconteceu e que
   não aparece em lugar nenhum hoje.

   NÃO acompanha pessoa. Vai o termo e o número de resultados, nada mais
   — sem telefone, sem identificador de sessão. É estatística de loja, e
   de propósito não dá para voltar dela a um cliente.

   O envio acontece quando a busca TERMINA, não a cada tecla. Se
   mandasse no meio, "d", "di", "dip" e "dipirona" virariam quatro
   buscas e o relatório mostraria pedaços de palavra no topo. Por isso o
   termo fica pendurado e só sai quando o cliente mostra que terminou:
   toca em Buscar, aperta Enter, ou sai da página. */

const BUSCA_MIN_LETRAS = 3;

let buscaPendente = null;
const buscasJaEnviadas = new Set();

/* Chamado pelo aplicarFiltro a cada refiltragem: é o único lugar que
   sabe, ao mesmo tempo, o termo e quantos produtos ele achou. */
function anotarBusca(termo, resultados) {

    if (!termo || termo.length < BUSCA_MIN_LETRAS) {
        buscaPendente = null;
        return;
    }

    // sobrescreve sempre: o termo mais novo é o que o cliente quis
    // dizer, e o anterior era só o caminho até ele
    buscaPendente = { termo, resultados };

}

function enviarBuscaPendente() {

    const pendente = buscaPendente;

    buscaPendente = null;

    if (!pendente) return;

    // mesma busca repetida na mesma visita conta uma vez: quem filtra e
    // volta atrás não deve pesar mais que quem buscou uma vez só
    if (buscasJaEnviadas.has(pendente.termo)) return;

    buscasJaEnviadas.add(pendente.termo);

    const corpo = JSON.stringify({
        termo: pendente.termo,
        resultados: pendente.resultados
    });

    try {

        // text/plain de propósito: sendBeacon não sobrevive a uma
        // verificação de CORS, e application/json exigiria uma. O worker
        // lê o corpo como JSON de qualquer jeito.
        const pacote = new Blob([corpo], { type: "text/plain" });

        if (navigator.sendBeacon?.(API_PEDIDOS_D1 + "/busca", pacote)) return;

        // navegador sem sendBeacon: keepalive faz o mesmo papel
        fetch(API_PEDIDOS_D1 + "/busca", {
            method: "POST",
            body: corpo,
            keepalive: true,
            headers: { "Content-Type": "text/plain" }
        }).catch(() => {});

    } catch {
        /* estatística não pode atrapalhar quem está comprando */
    }

}

document.addEventListener("DOMContentLoaded", () => {

    // O botão "Buscar" já chama buscar(), que fecha a busca por lá.
    el("busca")?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") enviarBuscaPendente();
    });

    // Sair da página é o sinal mais confiável de que a busca acabou, e
    // pega quem só digita e olha sem tocar em nada. No celular o
    // pagehide nem sempre dispara (o sistema pode matar a aba antes),
    // por isso o visibilitychange também está aqui.
    window.addEventListener("pagehide", enviarBuscaPendente);

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") enviarBuscaPendente();
    });

});

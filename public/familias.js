/* =====================================================
   Famílias de categoria — Drogaria Mais Barato
   =====================================================

   O FarmaxPDV exporta 51 categorias internas ("ETICO",
   "GENER/SIMILAR S/GT", "PRESTOBARBA"...). Elas viram um punhado de
   famílias com nome de gente, que é o que aparece nos filtros da
   vitrine e, agora, também no filtro de promoções do painel.

   Arquivo próprio porque são dois consumidores: o script.js do site e o
   painel.html da loja. Duas cópias da mesma lista é a receita para os
   dois discordarem sobre onde um produto está — e aí a loja põe promoção
   num grupo que na vitrine é outro.

   Carregado como script clássico, antes do script.js. Categoria nova
   que não estiver aqui cai em "Outros"; é só acrescentar.
   ===================================================== */

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
/* `curto` é o nome que cabe no atalho da home, quando o nome cheio não
   cabe: "Vitaminas e Suplementos" em 70px vira três linhas e estica a
   fileira inteira. O `nome` continua sendo o do chip, do título da
   seção e do painel — lá há largura, e "Vitaminas e Suplementos" diz
   mais que "Vitaminas". */
const FAMILIAS = [
  { id: "medicamentos", nome: "Medicamentos", medicamento: true,
    curto: "Remédios",
    icone: "fam-remedio",
    cats: ["ETICO", "GENERICO", "SIMILAR", "GENER/SIMILAR S/GT", "CARTELADOS"] },

  { id: "receita", nome: "Exigem receita", receita: true, medicamento: true,
    icone: "receita",
    cats: ["ETICO CONTROLADO"] },

  { id: "anticoncepcional", nome: "Anticoncepcionais", medicamento: true,
    curto: "Anticoncepcional",
    icone: "fam-cartela",
    cats: ["ANTICONCEPCIONAL"] },

  { id: "vitaminas", nome: "Vitaminas e Suplementos",
    curto: "Vitaminas",
    icone: "fam-vitamina",
    cats: ["VITAMINAS", "SUPLEMENTO"] },

  { id: "cabelo", nome: "Cabelo",
    icone: "fam-cabelo",
    cats: ["SHAMPOO", "CONDICIONADOR", "CREME PENTEAR", "CREME TRATAMENTO", "OLEO CAPILAR",
           "GEL FIXADOR CABELO", "TINTURA", "CR ALIS E MATIZADOR", "KIT SHAMPO/COND",
           "ESCOVA DE CABELO", "PENTE E ESCOVA",
           // DPCNET (categoria do topo da árvore, ver dpcnet-extrator):
           "CAPILAR", "COLORACAO"] },

  { id: "pele", nome: "Cuidados com a Pele",
    curto: "Pele",
    icone: "fam-pele",
    cats: ["DERMOCOSMETICO", "HIDRATANTE", "PROTETOR SOLAR", "OLEO CORPORAL",
           "LOÇAO FACIAL", "LOCAO FACIAL", "SABONETE LIQUIDO", "SABONETE BARRA",
           // DPCNET:
           "DERMO", "DERMO PROTETOR"] },

  { id: "perfumaria", nome: "Perfumaria",
    icone: "fam-perfume",
    cats: ["PERFUME", "DESODORANTE", "TALCO"] },

  { id: "higiene", nome: "Higiene Pessoal",
    curto: "Higiene",
    icone: "fam-higiene",
    cats: ["HIGIENE BUCAL", "HIGIENE PESSOAL", "ABSORVENTE", "PRESERVATIVO",
           "PRESTOBARBA", "DEPILATORIO",
           // DPCNET:
           "HIGIENE ORAL", "BARBA"] },

  { id: "beleza", nome: "Beleza e Maquiagem",
    curto: "Beleza",
    icone: "fam-beleza",
    cats: ["ESMALTES", "MAQUIAGEM",
           // DPCNET:
           "BELEZA"] },

  { id: "infantil", nome: "Infantil",
    icone: "fam-infantil",
    cats: ["LINHA INFANTIL", "FR INFANTIL", "FORMULA LEITE",
           // DPCNET:
           "FRALDA", "INFANTIL"] },

  { id: "saude", nome: "Saúde e Bem-estar",
    curto: "Saúde",
    icone: "fam-saude",
    cats: ["FR GERIATRICA", "ORTOPED", "LUVAS", "PERF/APLIC/AFERICAO", "REPELENTE",
           "TESOURA", "OFICINAL HOSPITALAR",
           // DPCNET:
           "SAÚDE"] },

  { id: "conveniencia", nome: "Conveniência",
    curto: "Conveniência",
    icone: "fam-conveniencia",
    cats: ["CONVENIENCIA", "DIVERSOS", "VAREJO", "PREMIUM 10", "HAVAIANA",
           // DPCNET - sem família própria que encaixe melhor: ALIMENTO
           // (achocolatado, adoçante...), LIMPEZA (produto de limpeza
           // doméstica, não higiene pessoal) e SANDÁLIA (chinelo comum,
           // não calçado ortopédico - esse sim iria pra Saúde):
           "BAZAR", "ALIMENTO", "LIMPEZA", "SANDÁLIA"] }
];

const FAMILIA_OUTROS = { id: "outros", nome: "Outros", icone: "fam-conveniencia", cats: [] };

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


/* =====================================================
   A CHAVE DE UM RÓTULO DE SUBFILTRO
   =====================================================

   Mora aqui, e não no script.js nem no painel.html, porque os DOIS
   precisam dela e precisam que seja a mesma: o painel grava o nome
   editado sob esta chave e o site procura por ela. Se as duas
   divergirem, a loja renomeia um rótulo e o site continua mostrando o
   antigo — defeito que ninguém liga a esta função.

   O que ela resolve, medido no catálogo publicado:

     "Creme De Tratamento" (99 produtos)  e  "Creme Tratamento" (3)
     "Dermocosmetico"                     e  "Dermocosmético"

   eram chips separados para a mesma coisa. Renomear não juntaria: daria
   dois chips com o mesmo nome, que é pior.

   Por isso ela tira acento e tira as palavrinhas de ligação. Não tira
   "com" nem "para": "shampoo com condicionador" e "shampoo para
   cachos" são coisas diferentes, e juntar seria pior que separar. */
function chaveRotulo(texto) {

  return String(texto || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((palavra) => !/^(de|da|do|das|dos|e)$/.test(palavra))
    .join(" ");

}


/* =====================================================
   O GRUPO FARMACOLÓGICO
   =====================================================

   A CMED classifica cada medicamento com um código tipo "M1A1 -
   ANTIRREUMÁTICOS NÃO ESTEROIDAIS PUROS". A letra da frente é o grupo
   anatômico, e é ela que interessa: as 240 classes distintas do
   catálogo viram 16 grupos, 12 deles com peso real.

   POR QUE ISSO SUBSTITUI A CLASSE DO PDV, dentro de medicamento. Os
   subfiltros eram "Etico", "Gener/Similar S/Gt", "Generico", "Similar"
   — classificação COMERCIAL, que diz como a farmácia compra e nada
   sobre para que o remédio serve. Quem chega com "dor nas costas" na
   cabeça não encontra nada ali. "Músculos e articulações" encontra.

   E POR QUE NÃO SUBSTITUI NO RESTO DA LOJA. A CMED é tabela de preço de
   medicamento: Higiene Pessoal tem 2 produtos classificados em 2.085,
   Cabelo tem 0 em 310. São 6.500 produtos — dois terços do catálogo —
   onde a classificação do PDV e da DPC é a única que existe.

   Os nomes abaixo são de prateleira, não de bula: o cliente procura
   "gripe", não "antiasmáticos/DPOC anticolinérgico".

   Letra sem nome aqui (V, L, K: 10 produtos no total) não vira grupo —
   cai na classe do PDV, como quem não cruzou com a CMED. Inventar um
   nome para cinco produtos seria uma prateleira vazia com placa. */
const GRUPO_FARMACOLOGICO = {
  A: "Estômago e digestão",
  B: "Sangue e circulação",
  C: "Coração e pressão",
  D: "Pele",
  G: "Saúde íntima",
  H: "Hormônios",
  J: "Antibióticos",
  M: "Músculos e articulações",
  N: "Dor e sistema nervoso",
  P: "Antiparasitários",
  R: "Gripe, tosse e respiração",
  S: "Olhos e ouvidos"
};

/* "C10A1 - ESTATINAS..." -> "Coração e pressão". null quando não há
   classe, quando o código não tem a forma esperada, ou quando a letra
   não está na lista acima. */
function grupoFarmacologico(classeTerapeutica) {

  const achado = /^\s*([A-Z]+)\d/.exec(String(classeTerapeutica || ""));

  return achado ? (GRUPO_FARMACOLOGICO[achado[1]] || null) : null;

}


/* Texto de rótulo em caixa de título, do jeito que se escreve em
   português: a primeira palavra sobe, as de ligação ficam embaixo.

   Sem a segunda metade saía "Dor E Sistema Nervoso" e "Creme De
   Tratamento" — a regra ingênua de subir toda letra depois de espaço.

   Mora aqui, e não no script.js e no painel.html, pela mesma razão da
   chaveRotulo: o painel mostra à loja o nome automático que o site vai
   usar, e duas versões divergindo é a loja "corrigindo" o que já
   estava certo. */
function tituloCaso(texto) {

  const LIGACAO = /^(de|da|do|das|dos|e|com|para|a|o|em|no|na)$/;

  return String(texto || "")
    .toLowerCase()
    .replace(/(^|[\s/])\p{L}/gu, (letra) => letra.toUpperCase())
    .split(" ")
    .map((palavra, i) =>
      i > 0 && LIGACAO.test(palavra.toLowerCase()) ? palavra.toLowerCase() : palavra)
    .join(" ");

}


/* O nome de um grupo farmacológico já vem escrito como se lê ("Dor e
   sistema nervoso"), diferente da classe crua do PDV, que vem em
   CAIXA ALTA e precisa de tratamento. Passar os dois pelo mesmo
   tituloCaso devolvia "Dor e Sistema Nervoso".

   Daí esta pergunta, usada pelo site e pelo painel para decidir se o
   rótulo já está pronto ou se é dado bruto. */
function ehGrupoFarmacologico(texto) {

  const alvo = String(texto || "").trim();

  return Object.values(GRUPO_FARMACOLOGICO).some((nome) => nome === alvo);

}

/* O rótulo como o cliente lê: pronto, se vier da CMED; tratado, se for
   texto cru do PDV ou da distribuidora. */
function rotuloDeExibicao(texto) {
  return ehGrupoFarmacologico(texto) ? String(texto).trim() : tituloCaso(texto);
}

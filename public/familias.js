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
           "ESCOVA DE CABELO", "PENTE E ESCOVA"] },

  { id: "pele", nome: "Cuidados com a Pele",
    curto: "Pele",
    icone: "fam-pele",
    cats: ["DERMOCOSMETICO", "HIDRATANTE", "PROTETOR SOLAR", "OLEO CORPORAL",
           "LOÇAO FACIAL", "LOCAO FACIAL", "SABONETE LIQUIDO", "SABONETE BARRA"] },

  { id: "perfumaria", nome: "Perfumaria",
    icone: "fam-perfume",
    cats: ["PERFUME", "DESODORANTE", "TALCO"] },

  { id: "higiene", nome: "Higiene Pessoal",
    curto: "Higiene",
    icone: "fam-higiene",
    cats: ["HIGIENE BUCAL", "HIGIENE PESSOAL", "ABSORVENTE", "PRESERVATIVO",
           "PRESTOBARBA", "DEPILATORIO"] },

  { id: "beleza", nome: "Beleza e Maquiagem",
    curto: "Beleza",
    icone: "fam-beleza",
    cats: ["ESMALTES", "MAQUIAGEM"] },

  { id: "infantil", nome: "Infantil",
    icone: "fam-infantil",
    cats: ["LINHA INFANTIL", "FR INFANTIL", "FORMULA LEITE"] },

  { id: "saude", nome: "Saúde e Bem-estar",
    curto: "Saúde",
    icone: "fam-saude",
    cats: ["FR GERIATRICA", "ORTOPED", "LUVAS", "PERF/APLIC/AFERICAO", "REPELENTE",
           "TESOURA", "OFICINAL HOSPITALAR"] },

  { id: "conveniencia", nome: "Conveniência",
    curto: "Conveniência",
    icone: "fam-conveniencia",
    cats: ["CONVENIENCIA", "DIVERSOS", "VAREJO", "PREMIUM 10", "HAVAIANA"] }
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

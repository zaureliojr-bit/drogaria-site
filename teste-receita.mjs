/* O que o site faz com cada remédio.

   Três decisões que não podem ser confundidas:

     bloqueioPresencial  Portaria 344, listas A/B: FORA do carrinho
     confirmarReceita    retenção: entra, mas o pedido pede a foto
     precisaDeReceita    só informação no card e na página

   Este arquivo existe por dois defeitos encontrados no mesmo dia, em
   direções opostas — e é por isso que os dois têm caso aqui.

   Uso: node teste-receita.mjs
*/

await import("./public/receita.js");
const { decidirReceita, ehVendaLivre } = globalThis.Receita;

let falhas = 0;
function conferir(descricao, condicao, detalhe = "") {
    if (condicao) console.log(`  ok   ${descricao}`);
    else {
        console.log(`  FALHA ${descricao}${detalhe ? "  → " + detalhe : ""}`);
        falhas++;
    }
}

/* Como o catálogo publicado traz hoje — inclusive as lacunas. */
const decidir = (p, trava = false) => decidirReceita(
    { descricao: p.descricao, tarja: p.tarja,
      bloqueioPresencial: p.bloqueioPresencial,
      receitaRemota: p.receitaRemota, confirmarReceita: p.confirmarReceita },
    { trava,
      categoriaControlada: String(p.categoria || "").toUpperCase() === "ETICO CONTROLADO",
      catalogoMarcaConfirmar: true }
);

/* ---- 1. o furo perigoso ---------------------------------------------- */
console.log("\n1. Portaria 344 A/B não escapa por falta de cadastro");
{
    /* O caso real: três apresentações do mesmo medicamento, e só a de
       30mg tinha tarja no cadastro. As outras duas estavam no carrinho,
       e uma delas foi parar num pedido de verdade. */
    const trinta = { descricao: "Venvanse 30mg Caixa com 28 Cap Gel Dura",
                     tarja: "P", categoria: "ETICO CONTROLADO", bloqueioPresencial: true };
    const cinquenta = { descricao: "Venvanse 50mg C/28 Capsulas Gel A3",
                        tarja: null, categoria: "ETICO CONTROLADO" };
    const setenta = { descricao: "Venvanse 70mg Caixa com 28 Cap Gel Dura",
                      tarja: null, categoria: "ETICO CONTROLADO" };

    conferir("o 30mg, que tinha cadastro, continua fora do carrinho",
        decidir(trinta).bloqueioPresencial === true);
    conferir("o 50mg, pela lista escrita no nome, também sai",
        decidir(cinquenta).bloqueioPresencial === true);
    conferir("e o 70mg, que não traz a lista no nome, pela substância",
        decidir(setenta).bloqueioPresencial === true);

    /* Os outros três que estavam soltos no catálogo de verdade. */
    for (const nome of ["Rivotril 2mg Caixa com 30 Comprimidos",
                        "Gardenal 50mg Caixa com 20 Comprimidos",
                        "Urbanil 10mg Caixa com 20 Comprimidos",
                        "Frisium 20mg Caixa com 20 Comprimidos"]) {
        conferir(`${nome.split(" ")[0]} sai do carrinho`,
            decidir({ descricao: nome, tarja: null, categoria: "ETICO CONTROLADO" })
                .bloqueioPresencial === true);
    }

    /* E com a trava de retenção desligada continua valendo: são dois
       assuntos, e desligar um não pode soltar o outro. */
    conferir("e nada disso depende da trava de retenção",
        decidir({ descricao: "Rivotril 2mg", tarja: null }, false).bloqueioPresencial === true
        && decidir({ descricao: "Rivotril 2mg", tarja: null }, true).bloqueioPresencial === true);
}

/* ---- 2. o furo chato -------------------------------------------------- */
console.log("\n2. venda livre não retém receita");
{
    /* O padronizador reconhece a substância antimicrobiana e marca
       retenção sem olhar a tarja. Eram 59 produtos, e é o que travava
       "remédio comum" no carrinho. */
    const livres = [
        { descricao: "Flogoral Laranja C/12 Pastilhas", tarja: "L",
          categoria: "ETICO", confirmarReceita: true },
        { descricao: "Clotrimazol Creme 20g Med", tarja: "L",
          categoria: "GENERICO", confirmarReceita: true },
        { descricao: "Sulfato Neomicina + Bacitracina 15g Ems", tarja: "L",
          categoria: "GENERICO", confirmarReceita: true },
        { descricao: "Bismu-Jet Solucao Gts 20ml", tarja: null,
          categoria: "GENER/SIMILAR S/GT", confirmarReceita: true }
    ];

    for (const p of livres) {
        const r = decidir(p, true);   // mesmo com a trava LIGADA
        conferir(`${p.descricao.split(" ")[0]} não pede receita`,
            r.confirmarReceita === false, JSON.stringify(r));
    }

    conferir("tarja livre é venda livre", ehVendaLivre("L") === true);
    conferir("sem tarja também", ehVendaLivre(null) === true);
    conferir("mas vermelha não", ehVendaLivre("V") === false);
}

/* ---- 3. o que a loja pediu -------------------------------------------- */
console.log("\n3. a trava desligada, e o que ela não desliga");
{
    const secnidazol = { descricao: "Secnidazol 1000mg Com/4 Comprimidos",
                         tarja: "V", categoria: "GENERICO", confirmarReceita: true };

    conferir("com a trava ligada, o antibiótico comum pedia receita",
        decidir(secnidazol, true).confirmarReceita === true);
    conferir("e com ela desligada, não pede mais — era o pedido da loja",
        decidir(secnidazol, false).confirmarReceita === false);

    /* Mas controlado da lista C continua pedindo, com trava ou sem.
       Desligar por causa de pastilha de garganta não pode significar
       despachar antidepressivo sem nenhum passo de receita. */
    const controladoC = { descricao: "Depakene 250mg C/25 Capsulas Gel (C1)",
                          tarja: "R", categoria: "ETICO CONTROLADO" };

    const r = decidir(controladoC, false);
    conferir("controlado da lista C continua pedindo receita",
        r.confirmarReceita === true, JSON.stringify(r));
    conferir("e não foi bloqueado por engano — lista C vende pelo site",
        r.bloqueioPresencial === false, JSON.stringify(r));
}

/* ---- 4. o remédio comum ----------------------------------------------- */
console.log("\n4. o que não é nada disso");
{
    for (const nome of ["Dipirona 500mg C/10", "Protetor Solar FPS 50",
                        "Shampoo Anticaspa 200ml"]) {
        const r = decidir({ descricao: nome, tarja: null, categoria: "GENERICO" });
        conferir(`${nome.split(" ")[0]} passa direto`,
            !r.bloqueioPresencial && !r.confirmarReceita, JSON.stringify(r));
    }

    /* A rede olha palavra inteira: "Diazepam" bloqueia, mas um produto
       cujo nome contenha "A3" como pedaço de outra coisa não. */
    const falso = decidir({ descricao: "Agulha A30 Caixa", tarja: null });
    conferir("'A30' não é a lista A3", falso.bloqueioPresencial === false,
        JSON.stringify(falso));
}

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

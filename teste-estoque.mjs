/* Quantas unidades o cliente pode levar.

   Duas coisas, e confundi-las é o jeito de errar:

     o LIMITE   o carrinho não aceita o que não existe na prateleira
     o NÚMERO   "últimas 2 unidades" na tela — informação, e com data de
                validade: o estoque vem de uma extração do PDV que roda
                uma vez por dia

   Uso: node teste-estoque.mjs
*/

await import("./public/estoque.js");
const E = globalThis.Estoque;

let falhas = 0;
function conferir(descricao, condicao, detalhe = "") {
    if (condicao) console.log(`  ok   ${descricao}`);
    else {
        console.log(`  FALHA ${descricao}${detalhe ? "  → " + detalhe : ""}`);
        falhas++;
    }
}

/* ---- 1. como o estoque chega do FarmaxPDV --------------------------- */
console.log("\n1. o campo do PDV, em todas as formas que ele aparece");
{
    conferir("número inteiro", E.quantidade({ estoque: 7 }) === 7);
    conferir("texto com vírgula", E.quantidade({ estoque: "3,00" }) === 3);
    conferir("texto com ponto", E.quantidade({ estoque: "2.0" }) === 2);
    conferir("fração desce para o inteiro — meia caixa não se vende",
        E.quantidade({ estoque: "2,8" }) === 2, String(E.quantidade({ estoque: "2,8" })));

    /* null é "não sei", e não zero. É disso que depende a loja não
       aparecer esgotada se a coluna sumir da exportação. */
    for (const bruto of [undefined, null, "", "   ", "S", "SIM"]) {
        conferir(`${JSON.stringify(bruto)} vale como desconhecido`,
            E.quantidade({ estoque: bruto }) === null,
            String(E.quantidade({ estoque: bruto })));
    }
}

/* ---- 2. o limite, que é o que resolve o problema -------------------- */
console.log("\n2. o carrinho não aceita o que não existe");
{
    const doisNaPrateleira = { nome: "Dipirona 500mg C/10", estoque: 2 };

    conferir("o limite é o estoque", E.limiteDeCompra(doisNaPrateleira) === 2);
    conferir("cabe a primeira", E.cabeMaisUm(doisNaPrateleira, 0) === true);
    conferir("cabe a segunda", E.cabeMaisUm(doisNaPrateleira, 1) === true);

    /* O defeito que isto fecha: o carrinho aceitava 6 unidades de um
       item que tem 2, e a conta só aparecia no WhatsApp — com a
       farmacêutica avisando que vai faltar parte do pedido. */
    conferir("NÃO cabe a terceira", E.cabeMaisUm(doisNaPrateleira, 2) === false);
    conferir("nem a sétima", E.cabeMaisUm(doisNaPrateleira, 6) === false);

    /* Sem informação não é "pode pedir 300". Um pedido desse tamanho num
       site de bairro é dedo escorregando no botão, não compra. */
    const semInfo = { nome: "Fralda", estoque: "" };
    conferir("sem informação, vale o teto de segurança",
        E.limiteDeCompra(semInfo) === E.TETO_SEM_INFORMACAO,
        String(E.limiteDeCompra(semInfo)));
    conferir("e o teto é um número de farmácia de bairro",
        E.TETO_SEM_INFORMACAO >= 6 && E.TETO_SEM_INFORMACAO <= 24,
        String(E.TETO_SEM_INFORMACAO));

    /* Estoque alto não vira carrinho de atacado pela porta dos fundos. */
    conferir("estoque grande também respeita o teto",
        E.limiteDeCompra({ estoque: 400 }) === E.TETO_SEM_INFORMACAO,
        String(E.limiteDeCompra({ estoque: 400 })));
}

/* ---- 3. o carrinho de ontem ---------------------------------------- */
console.log("\n3. a quantidade salva no aparelho também envelhece");
{
    const p = { nome: "Ibuprofeno 400mg", estoque: 2 };

    /* Montou 5 ontem, quando havia 5. Hoje a extração da manhã diz 2. */
    conferir("5 unidades de ontem descem para as 2 de hoje",
        E.ajustarQuantidade(p, 5) === 2, String(E.ajustarQuantidade(p, 5)));
    conferir("e o que cabe não é mexido",
        E.ajustarQuantidade(p, 1) === 1, String(E.ajustarQuantidade(p, 1)));
    conferir("quantidade suja não vira negativo",
        E.ajustarQuantidade(p, -3) === 0, String(E.ajustarQuantidade(p, -3)));
}

/* ---- 4. o número na tela ------------------------------------------- */
console.log("\n4. o número aparece quando muda a decisão de quem compra");
{
    const uma = E.rotuloDeDisponibilidade({ estoque: 1 });
    conferir("uma unidade: fala no singular",
        uma.poucas && /Última unidade/.test(uma.texto), uma.texto);

    const duas = E.rotuloDeDisponibilidade({ estoque: 2 });
    conferir("duas: diz quantas são",
        duas.poucas && /2 unidades/.test(duas.texto), duas.texto);

    /* O ponto de todo o arquivo: de MOSTRAR_ATE para cima, a tela volta
       a dizer só "disponível". O estoque é uma foto de uma vez por dia,
       e um "restam 47" visto às 18h não ajuda ninguém a decidir — só
       deixa a loja devendo explicação por um número que envelheceu. */
    const muitas = E.rotuloDeDisponibilidade({ estoque: E.MOSTRAR_ATE + 1 });
    conferir("acima da fronteira, nenhum número na tela",
        !muitas.poucas && !/\d/.test(muitas.texto), muitas.texto);

    const desconhecido = E.rotuloDeDisponibilidade({ estoque: "" });
    conferir("desconhecido não inventa número",
        !desconhecido.poucas && !/\d/.test(desconhecido.texto), desconhecido.texto);

    /* A fronteira é baixa de propósito: "últimas 9 unidades" não é
       urgência nenhuma, é só estoque. */
    conferir("a fronteira continua sendo 'poucas'",
        E.MOSTRAR_ATE >= 2 && E.MOSTRAR_ATE <= 6, String(E.MOSTRAR_ATE));
}

/* ---- 5. o aviso de quem apertou o + no limite ----------------------- */
console.log("\n5. o '+' no limite explica, em vez de não fazer nada");
{
    /* Botão que não responde é o pior dos dois mundos: o cliente acha
       que o site travou. Aqui, acima do limite, ele ganha o número — e
       no limite acima do MOSTRAR_ATE ganha um caminho, que é o
       WhatsApp. */
    const aviso = E.avisoDeLimite({ nome: "Dipirona", estoque: 2 });
    conferir("diz o número que existe", /2 unidades/.test(aviso), aviso);
    conferir("e o nome do produto", /Dipirona/.test(aviso), aviso);

    const uma = E.avisoDeLimite({ nome: "Dipirona", estoque: 1 });
    conferir("uma unidade no singular", /só 1 unidade/.test(uma), uma);

    const teto = E.avisoDeLimite({ nome: "Fralda", estoque: "" });
    conferir("no teto sem informação, manda para o WhatsApp",
        /WhatsApp/.test(teto), teto);
}

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

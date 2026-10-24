/* A conta das promoções de quantidade.

   É a conta mais perigosa do site, e por um motivo que não é técnico:
   ela é a única em que o cliente chega ao balcão com um número na
   cabeça. "Vi 3 por 10 no site." Se a conta daqui discordar do que a
   atendente cobra, não é um bug — é uma discussão no caixa, com fila
   atrás, e a loja decidindo na hora entre perder dinheiro e perder o
   cliente.

   Por isso o teste insiste em três coisas:

   1. A SOBRA SAI PELO PREÇO NORMAL. Quem leva 7 com "3 por 10" paga
      dois pacotes e uma solta. Não existe pacote pela metade.

   2. OFERTA QUE ENCARECE É IGNORADA. Acontece quando a planilha é
      reexportada mais barata e a oferta antiga continua no ar. Cobrar
      R$ 10 por três coisas que valem R$ 8,70 é punir quem confiou na
      promoção.

   3. O "LEVE E PAGUE" ACOMPANHA O PREÇO DO DIA. A loja prometeu dar
      uma unidade, não um valor.

   Uso: node teste-promo-qtd.mjs
*/

import { readFileSync } from "node:fs";

const fonte = readFileSync(new URL("./public/promoQtd.js", import.meta.url), "utf8");
const caixa = {};
new Function("globalThis", fonte).call(caixa, caixa);
const { PromoQtd } = caixa;

let falhas = 0;
const conferir = (d, c, det = "") => {
    if (c) console.log(`  ok   ${d}`);
    else { console.log(`  FALHA ${d}${det ? "  → " + det : ""}`); falhas++; }
};

const LEVE3PAGUE2 = { tipo: "leve-pague", leve: 3, pague: 2 };
const TRES_POR_10 = { tipo: "pacote", quantidade: 3, preco: 10 };

/* ---- 1. leve 3 pague 2 ----------------------------------------------- */
console.log("\n1. leve 3 pague 2, a R$ 5,00 cada");
{
    const conta = (q) => PromoQtd.aplicar(LEVE3PAGUE2, q, 5);

    conferir("1 unidade paga 1", conta(1).total === 5, String(conta(1).total));
    conferir("2 unidades pagam 2", conta(2).total === 10, String(conta(2).total));
    conferir("3 unidades pagam 2", conta(3).total === 10, String(conta(3).total));

    /* A sobra pelo preço normal: 3 + 1. Uma conta que desse desconto
       proporcional cobraria R$ 13,33 e a atendente cobraria R$ 15. */
    conferir("4 unidades: um pacote e uma solta", conta(4).total === 15,
        String(conta(4).total));

    conferir("6 unidades: dois pacotes", conta(6).total === 20, String(conta(6).total));
    conferir("7 unidades: dois pacotes e uma solta", conta(7).total === 25,
        String(conta(7).total));

    conferir("a economia de 6 é R$ 10", conta(6).economia === 10, String(conta(6).economia));
}

/* ---- 2. 3 por R$ 10 --------------------------------------------------- */
console.log("\n2. 3 por R$ 10, com a unidade a R$ 4,50");
{
    const conta = (q) => PromoQtd.aplicar(TRES_POR_10, q, 4.5);

    conferir("2 unidades ainda pagam cheio", conta(2).total === 9, String(conta(2).total));
    conferir("3 fecham o pacote", conta(3).total === 10, String(conta(3).total));
    conferir("4: pacote mais uma solta", conta(4).total === 14.5, String(conta(4).total));
    conferir("6: dois pacotes", conta(6).total === 20, String(conta(6).total));

    conferir("a economia de 3 é R$ 3,50", conta(3).economia === 3.5,
        String(conta(3).economia));
}

/* ---- 3. a oferta que encareceu --------------------------------------- */
console.log("\n3. a planilha baixou o preço e a oferta ficou cara");
{
    /* O caso real que isto evita: "3 por R$ 10" continua no ar depois
       de o produto cair para R$ 2,90. Três soltas custam R$ 8,70. */
    const conta = PromoQtd.aplicar(TRES_POR_10, 3, 2.9);

    conferir("a oferta é ignorada", conta.temOferta === false, JSON.stringify(conta));
    conferir("e o cliente paga o preço normal", conta.total === 8.7, String(conta.total));
    conferir("sem economia inventada", conta.economia === 0, String(conta.economia));

    /* E some da tela: anunciar uma promoção que não é aplicada seria
       pior que não ter promoção. */
    conferir("o rótulo não aparece", PromoQtd.rotulo(TRES_POR_10, 2.9) === "",
        PromoQtd.rotulo(TRES_POR_10, 2.9));

    conferir("mas continua valendo quando o preço volta",
        PromoQtd.aplicar(TRES_POR_10, 3, 4.5).temOferta === true);
}

/* ---- 4. o leve-e-pague acompanha o preço ------------------------------ */
console.log("\n4. 'leve 3 pague 2' não congela valor");
{
    /* A loja prometeu dar uma unidade, não R$ 5. Quando o produto cai
       para R$ 4, o pacote cai junto — sozinho, sem ninguém reeditar a
       promoção. */
    conferir("a R$ 5, o pacote custa 10",
        PromoQtd.aplicar(LEVE3PAGUE2, 3, 5).total === 10);
    conferir("a R$ 4, o pacote custa 8",
        PromoQtd.aplicar(LEVE3PAGUE2, 3, 4).total === 8);
}

/* ---- 5. cadastro que não faz sentido ---------------------------------- */
console.log("\n5. o que o painel precisa recusar");
{
    const erro = (o, p) => PromoQtd.erroDeCadastro(o, p);

    conferir("pagar 3 levando 3",
        erro({ tipo: "leve-pague", leve: 3, pague: 3 }, 5) !== "",
        erro({ tipo: "leve-pague", leve: 3, pague: 3 }, 5));

    conferir("pagar 4 levando 3",
        erro({ tipo: "leve-pague", leve: 3, pague: 4 }, 5) !== "");

    /* "Leve 1 pague 1" não é oferta de quantidade — é preço, e para
       isso já existe a promoção comum. */
    conferir("pacote de 1",
        erro({ tipo: "leve-pague", leve: 1, pague: 1 }, 5) !== "");

    conferir("pacote sem preço",
        erro({ tipo: "pacote", quantidade: 3, preco: 0 }, 5) !== "");

    /* O recado tem de ser lido antes de salvar, e tem de dizer o que
       vai acontecer — não só "inválido". */
    const caro = erro({ tipo: "pacote", quantidade: 3, preco: 20 }, 5);
    conferir("pacote mais caro avisa que será ignorado",
        /ignorar/i.test(caro), caro);

    conferir("e o cadastro correto passa",
        erro(TRES_POR_10, 4.5) === "" && erro(LEVE3PAGUE2, 5) === "");
}

/* ---- 6. os rótulos ---------------------------------------------------- */
console.log("\n6. como a oferta aparece escrita");
{
    conferir("leve e pague", PromoQtd.rotulo(LEVE3PAGUE2, 5) === "Leve 3 pague 2",
        PromoQtd.rotulo(LEVE3PAGUE2, 5));

    conferir("pacote", PromoQtd.rotulo(TRES_POR_10, 4.5) === "3 por R$ 10,00",
        PromoQtd.rotulo(TRES_POR_10, 4.5));
}

/* ---- 7. o empurrão quando falta pouco --------------------------------- */
console.log("\n7. 'leve mais 1'");
{
    /* É o que transforma a promoção em venda. Sem isto ela só existe
       para quem já ia levar três. */
    conferir("com 2 no carrinho, falta 1",
        PromoQtd.convite(LEVE3PAGUE2, 2, 5) === "Leve mais 1 e pague só 2",
        PromoQtd.convite(LEVE3PAGUE2, 2, 5));

    conferir("no pacote, o convite some",
        PromoQtd.convite(LEVE3PAGUE2, 3, 5) === "",
        PromoQtd.convite(LEVE3PAGUE2, 3, 5));

    conferir("com 4, falta 2 para o segundo pacote",
        /mais 2/.test(PromoQtd.convite(LEVE3PAGUE2, 4, 5)),
        PromoQtd.convite(LEVE3PAGUE2, 4, 5));

    /* Quem não pôs nenhuma não recebe convite: ali é anúncio, e o
       lugar do anúncio é o rótulo do card. */
    conferir("carrinho vazio não recebe convite",
        PromoQtd.convite(LEVE3PAGUE2, 0, 5) === "",
        PromoQtd.convite(LEVE3PAGUE2, 0, 5));

    conferir("o convite do pacote diz o valor",
        PromoQtd.convite(TRES_POR_10, 2, 4.5) === "Leve mais 1 e leve 3 por R$ 10,00",
        PromoQtd.convite(TRES_POR_10, 2, 4.5));
}

/* ---- 8. sem oferta nenhuma -------------------------------------------- */
console.log("\n8. produto comum");
{
    const conta = PromoQtd.aplicar(null, 3, 4.5);

    /* Quem chama não precisa saber se existe promoção para somar. */
    conferir("a conta normal continua saindo", conta.total === 13.5, String(conta.total));
    conferir("marcada como sem oferta", conta.temOferta === false);

    conferir("oferta pela metade também é ignorada",
        PromoQtd.aplicar({ tipo: "pacote", quantidade: 3 }, 3, 4.5).total === 13.5);
}

/* ---- 9. centavos ------------------------------------------------------ */
console.log("\n9. a conta fecha em centavos");
{
    /* Preço quebrado é o normal numa farmácia, e um centavo de
       diferença entre a tela e o caixa é discussão na mesma hora. */
    const conta = PromoQtd.aplicar({ tipo: "pacote", quantidade: 2, preco: 19.99 }, 5, 12.33);

    // dois pacotes (39,98) + uma solta (12,33)
    conferir("dois pacotes e uma solta", conta.total === 52.31, String(conta.total));
    conferir("a economia bate", conta.economia === 9.34, String(conta.economia));

    const leve = PromoQtd.aplicar({ tipo: "leve-pague", leve: 3, pague: 2 }, 3, 3.33);
    conferir("leve 3 pague 2 com preço quebrado", leve.total === 6.66, String(leve.total));
}

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);

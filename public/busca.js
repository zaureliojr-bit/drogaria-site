/* =====================================================================
   Sugestões enquanto se digita
   =====================================================================

   O cliente digita "dip" e o site espera ele terminar. Numa farmácia
   isso pesa mais que numa loja qualquer: nome de remédio é comprido,
   tem dosagem e apresentação no meio ("Dipirona Sódica 500mg C/10"), e
   quem está com dor de cabeça não quer escrever tudo — quer ver a
   palavra aparecer e tocar nela.

   O que decide a ordem, e por quê:

     1. quem COMEÇA com o que foi digitado vem antes de quem tem a
        palavra no meio, e esse antes de quem só contém o pedaço.
        "dip" traz "Dipirona" antes de "Adesivo Dipirona";
     2. nome mais curto antes do mais longo. Entre "Dipirona 500mg
        C/10" e "Dipirona Sódica Monoidratada 500mg Com/10 Genérico",
        a primeira é a que a pessoa reconhece;
     3. o que dá para comprar agora antes do que está esgotado. Sugerir
        o que não tem é mandar a pessoa bater na porta fechada.

   Uma sugestão por NOME, e não por produto: o catálogo tem a mesma
   dipirona em três cadastros (apresentações diferentes do mesmo item,
   ou duplicata do PDV), e três linhas iguais na lista não ajudam
   ninguém a escolher.

   Arquivo próprio, como receita.js e estoque.js, porque é regra pura —
   roda sem navegador e tem teste (teste-busca-sugestoes.mjs).
   ===================================================================== */

(function (raiz) {

    /* Mesma normalização do script.js: sem acento, minúsculo, aparado.
       Ela é repetida aqui de propósito — este arquivo precisa rodar
       sozinho no teste, sem carregar o site inteiro. Se as duas
       divergirem, a sugestão deixa de casar com o resultado da busca,
       e o teste do site inteiro pega isso. */
    function semAcento(texto) {
        return String(texto == null ? "" : texto)
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .toLowerCase()
            .trim();
    }

    /* Abaixo de duas letras não é busca, é a pessoa começando a
       digitar: "d" traria mil produtos em ordem arbitrária. */
    const MINIMO_DE_LETRAS = 2;

    function sugerir(produtos, termo, opcoes) {

        const op = opcoes || {};
        const limite = op.limite || 6;

        const procurado = semAcento(termo);

        if (procurado.length < MINIMO_DE_LETRAS) return [];
        if (!Array.isArray(produtos)) return [];

        const achados = [];

        for (const p of produtos) {

            if (!p || !p.nome) continue;

            /* O índice de busca do catálogo (nome + marca + laboratório
               + EAN) é o mesmo que o filtro da grade usa. Sugerir por
               um critério e filtrar por outro faria a sugestão levar a
               uma lista que não a contém. */
            const indice = p.busca || semAcento(p.nome);

            if (!indice.includes(procurado)) continue;

            const nome = semAcento(p.nome);

            achados.push({
                nome: p.nome,
                marca: p.marca || p.laboratorio || "",
                ean: p.ean,
                codigo: p.codigo,
                preco: p.preco,
                /* Três degraus, e não "começa ou não".

                   O primeiro teste escrito aqui tratava "começo do
                   nome" e "começo de qualquer palavra" como a mesma
                   coisa — e aí "Adesivo Dipirona Infantil" empatava com
                   "Dipirona Gotas" em quem digitou "dip", e passava na
                   frente da "Dipirona Sódica" só por ter nome menor.
                   Quem digita o começo de um nome quer aquele nome.

                     0  o nome começa com o que foi digitado
                     1  alguma palavra do nome começa ("dipirona 500"
                        achada por "500")
                     2  aparece no meio de uma palavra, ou só na marca */
                posicao: nome.startsWith(procurado)
                    ? 0
                    : nome.split(/[^a-z0-9]+/).some((parte) => parte.startsWith(procurado))
                        ? 1
                        : 2,
                disponivel: p.temEstoque !== false
            });

        }

        achados.sort(function (a, b) {
            if (a.disponivel !== b.disponivel) return a.disponivel ? -1 : 1;
            if (a.posicao !== b.posicao) return a.posicao - b.posicao;
            if (a.nome.length !== b.nome.length) return a.nome.length - b.nome.length;
            return a.nome.localeCompare(b.nome, "pt-BR");
        });

        /* Um por nome. Depois da ordenação, de propósito: o primeiro de
           cada nome repetido já é o melhor dos iguais. */
        const vistos = new Set();
        const lista = [];

        for (const achado of achados) {

            const chave = semAcento(achado.nome);

            if (vistos.has(chave)) continue;

            vistos.add(chave);
            lista.push(achado);

            if (lista.length >= limite) break;

        }

        return lista;

    }

    /* A mesma limpeza, mas LETRA POR LETRA, para a posição encontrada
       valer no texto original.

       O semAcento acima serve para comparar; para recortar não serve:
       ele apara as pontas (muda o começo) e, num texto que já venha
       decomposto, "á" ocupa dois caracteres e vira um — a partir dali
       todo índice anda, e o destaque sai deslocado no meio da palavra.
       Aqui cada caractere de entrada produz exatamente um de saída. */
    function limpoCaractereACaractere(texto) {

        let saida = "";

        for (const letra of String(texto || "")) {
            const limpo = letra.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            saida += limpo.length ? limpo[0] : letra.toLowerCase();
        }

        return saida;

    }

    /* Onde o trecho digitado aparece no nome — para a tela poder
       destacá-lo. Devolve as três partes em vez de HTML pronto: quem
       monta HTML é a página, que sabe escapar o que veio do catálogo. */
    function partesDoDestaque(nome, termo) {

        const texto = String(nome || "");
        const procurado = semAcento(termo);

        if (!procurado) return { antes: texto, meio: "", depois: "" };

        const onde = limpoCaractereACaractere(texto).indexOf(procurado);

        if (onde < 0) return { antes: texto, meio: "", depois: "" };

        return {
            antes: texto.slice(0, onde),
            meio: texto.slice(onde, onde + procurado.length),
            depois: texto.slice(onde + procurado.length)
        };

    }

    raiz.Busca = { sugerir, partesDoDestaque, MINIMO_DE_LETRAS };

})(typeof globalThis !== "undefined" ? globalThis : window);

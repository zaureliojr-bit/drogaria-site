/* =====================================================================
   Reativação de clientes — a decisão, sem tela
   =====================================================================

   Quem parou de comprar, com o telefone arrumado e pronto para mandar
   mensagem no WhatsApp. Esta parte é só a conta: telefone, duplicado,
   não perturbe e a mensagem. A tela fica no painel.

   Arquivo próprio, e não dentro do painel.html, porque é a parte que
   dá para rodar sem navegador — e é exatamente onde morava o defeito
   que mandava a mensagem para a pessoa errada:

   TELEFONE FIXO VIRANDO CELULAR DE ESTRANHO

   A ferramenta antiga tratava "10 dígitos" como celular antigo e punha
   um 9 na frente. Isso está certo para o celular de antes de 2016 e
   ERRADO para telefone fixo — e fixo é metade do cadastro de farmácia,
   porque o cliente mais antigo deu o número de casa.

       (11) 3251-4000  →  11 93251-4000

   Esse celular existe e é de OUTRA pessoa. Quem recebia "você não
   compra há 183 dias, sentimos sua falta" era um estranho, com o nome
   de um cliente da farmácia junto. É vazamento de dado de cliente, não
   um disparo perdido — e a tela mostrava "Pronto".

   O que separa os dois é o primeiro dígito depois do DDD:

       2 a 5   fixo       não dá para mandar WhatsApp
       6 a 9   celular    é aqui que o nono dígito entra
   ===================================================================== */

(function (raiz) {

    /* A lista real de DDDs. "00", "29" e "40" não existem, e um deles
       aparece sempre que alguém digita errado no cadastro do PDV. */
    var DDDS = {};
    [11,12,13,14,15,16,17,18,19,
     21,22,24,27,28,
     31,32,33,34,35,37,38,
     41,42,43,44,45,46,47,48,49,
     51,53,54,55,
     61,62,63,64,65,66,67,68,69,
     71,73,74,75,77,79,
     81,82,83,84,85,86,87,88,89,
     91,92,93,94,95,96,97,98,99].forEach(function (d) { DDDS[String(d)] = true; });

    function soDigitos(texto) {
        return String(texto == null ? "" : texto).replace(/\D/g, "");
    }

    function dddValido(ddd) {
        return DDDS[String(ddd)] === true;
    }

    /* Em `situacao`:

         ok        dá para mandar
         semDDD    é celular, mas não sabemos de onde
         fixo      é telefone fixo; WhatsApp não vai
         invalido  não é telefone

       `fixo` é situação própria, e não "inválido", porque a farmácia
       PODE ligar para esse cliente. Jogar os dois no mesmo balde
       esconderia uma lista de gente que vale a pena telefonar. */
    function normalizarTelefone(bruto) {

        var digitos = soDigitos(bruto);

        if (!digitos) return { situacao: "invalido", motivo: "sem número" };

        /* +55 do país, quando o cadastro já guarda assim. Só quando o
           que sobra tem tamanho de telefone. */
        if ((digitos.length === 12 || digitos.length === 13) && digitos.indexOf("55") === 0) {
            digitos = digitos.slice(2);
        }

        /* 11111111111, 00000000000: campo preenchido para passar da
           validação do PDV. Não é telefone de ninguém. */
        if (/^(\d)\1+$/.test(digitos)) {
            return { situacao: "invalido", motivo: "dígito repetido", digitos: digitos };
        }

        var ehFixo = function (d) { return d >= "2" && d <= "5"; };

        if (digitos.length === 11) {
            var ddd11 = digitos.slice(0, 2);
            var num11 = digitos.slice(2);

            if (!dddValido(ddd11)) {
                return { situacao: "invalido", motivo: "DDD " + ddd11 + " não existe", digitos: digitos };
            }
            if (num11[0] !== "9") {
                return { situacao: "invalido", motivo: "11 dígitos e não começa com 9", digitos: digitos };
            }
            return { situacao: "ok", ddd: ddd11, numero: num11, e164: "55" + ddd11 + num11 };
        }

        if (digitos.length === 10) {
            var ddd10 = digitos.slice(0, 2);
            var local = digitos.slice(2);

            if (!dddValido(ddd10)) {
                return { situacao: "invalido", motivo: "DDD " + ddd10 + " não existe", digitos: digitos };
            }

            if (ehFixo(local[0])) {
                return { situacao: "fixo", ddd: ddd10, numero: local, motivo: "telefone fixo" };
            }

            /* Celular de antes do nono dígito. É aqui, e SÓ aqui, que
               acrescentar o 9 é a coisa certa. */
            return {
                situacao: "ok", ddd: ddd10, numero: "9" + local,
                e164: "55" + ddd10 + "9" + local
            };
        }

        if (digitos.length === 9) {
            if (digitos[0] !== "9") {
                return { situacao: "invalido", motivo: "9 dígitos e não começa com 9", digitos: digitos };
            }
            return { situacao: "semDDD", numero: digitos };
        }

        if (digitos.length === 8) {
            if (ehFixo(digitos[0])) {
                return { situacao: "fixo", numero: digitos, motivo: "fixo, e sem DDD" };
            }
            return { situacao: "semDDD", numero: "9" + digitos };
        }

        return { situacao: "invalido", motivo: digitos.length + " dígitos", digitos: digitos };

    }

    /* Completa um `semDDD` com o DDD que a loja escolheu.

       Devolve um registro NOVO em vez de alterar o que chegou: é o que
       permite a tela mostrar o resultado antes de a pessoa confirmar. */
    function comDDD(resultado, ddd) {

        var limpo = soDigitos(ddd).slice(0, 2);

        if (resultado.situacao !== "semDDD" || !dddValido(limpo)) return resultado;

        return {
            situacao: "ok", ddd: limpo, numero: resultado.numero,
            e164: "55" + limpo + resultado.numero
        };

    }

    function formatarTelefone(resultado) {

        if (!resultado || !resultado.numero) return "";

        var n = resultado.numero;
        var local = n.length === 9
            ? n.slice(0, 5) + "-" + n.slice(5)
            : n.slice(0, 4) + "-" + n.slice(4);

        return resultado.ddd ? "(" + resultado.ddd + ") " + local : local;

    }

    var PREPOSICOES = { de: 1, da: 1, do: 1, das: 1, dos: 1, e: 1, di: 1, du: 1 };

    function tituloDeNome(texto) {

        return String(texto || "").trim().replace(/\s+/g, " ").split(" ").map(function (palavra, i) {

            var baixa = palavra.toLowerCase();

            if (i > 0 && PREPOSICOES[baixa]) return baixa;

            /* d'Ávila, Sant'Ana: a letra depois do apóstrofo também é
               começo de palavra. */
            return baixa.replace(
                /(^|[^a-záàâãéêíóôõúüç])([a-záàâãéêíóôõúüç])/gi,
                function (_, antes, letra) { return antes + letra.toUpperCase(); }
            );

        }).join(" ");

    }

    function paraInteiro(valor) {
        var n = parseInt(String(valor == null ? "" : valor).replace(/\D/g, ""), 10);
        return isFinite(n) ? n : 0;
    }

    /* Uma pessoa é o TELEFONE, e não o nome: nome repete (três "Maria
       Silva" numa cidade) e muda de grafia entre dois cadastros do
       mesmo cliente. */
    function chaveDaPessoa(registro) {
        if (registro.telefone.e164) return registro.telefone.e164;
        if (registro.telefone.numero) return "sem-ddd:" + registro.telefone.numero;
        return "linha:" + registro.id;
    }

    /* DUPLICADO. O relatório do PDV traz uma linha por ficha, não por
       pessoa. Quem tem duas fichas — marido e esposa no mesmo celular,
       ou o mesmo cliente recadastrado — recebia a mensagem duas vezes,
       com o nome trocado. É o que faz alguém bloquear a farmácia.

       NÃO PERTURBE. Quem responde "não quero mais receber" precisa
       nunca mais aparecer. Sem essa lista, na campanha seguinte a
       pessoa é reimportada e recebe de novo — e aí não é descuido, é
       insistência depois de um não.

       O "dias sem comprar" de uma farmácia diz mais do que parece:
       quem comprava o mesmo remédio todo mês e parou é informação sobre
       a saúde daquela pessoa. É por isso que o bloqueio entra ANTES de
       montar a lista, e não como filtro de tela. */
    function montarRegistros(linhas, opcoes) {

        var naoPerturbe = (opcoes && opcoes.naoPerturbe) || [];
        var bloqueados = {};
        naoPerturbe.forEach(function (n) { bloqueados[n] = true; });

        var porPessoa = {};
        var ordem = [];
        var descartadosNaoPerturbe = 0;

        linhas.forEach(function (linha, indice) {

            var nome = tituloDeNome(linha.nome);
            var bruto = String(linha.telefone || "").trim();

            if (!nome && !bruto) return;

            var telefone = normalizarTelefone(bruto);

            if (telefone.e164 && bloqueados[telefone.e164]) {
                descartadosNaoPerturbe++;
                return;
            }

            var registro = {
                id: "r" + indice,
                nome: nome,
                bruto: bruto,
                dias: paraInteiro(linha.dias),
                telefone: telefone,
                contato: "Não enviado",
                fichas: 1
            };

            var chave = chaveDaPessoa(registro);

            if (!porPessoa[chave]) {
                porPessoa[chave] = registro;
                ordem.push(chave);
                return;
            }

            /* Mesma pessoa em duas fichas: vale o MENOR "dias sem
               comprar". É o número verdadeiro — ela comprou na data
               mais recente das duas, mesmo que a compra tenha usado o
               outro cadastro. Ficar com o maior diria que um cliente
               ativo está sumido há seis meses. */
            var jaTinha = porPessoa[chave];
            jaTinha.fichas++;
            if (registro.dias < jaTinha.dias) {
                jaTinha.dias = registro.dias;
                jaTinha.nome = registro.nome || jaTinha.nome;
            }

        });

        var registros = ordem.map(function (c) { return porPessoa[c]; });

        return {
            registros: registros,
            duplicadosUnidos: registros.reduce(function (s, r) { return s + (r.fichas - 1); }, 0),
            descartadosNaoPerturbe: descartadosNaoPerturbe
        };

    }

    function contarPorSituacao(registros) {

        var conta = { total: registros.length, ok: 0, semDDD: 0, fixo: 0, invalido: 0 };

        registros.forEach(function (r) { conta[r.telefone.situacao]++; });

        return conta;

    }

    /* {primeiro} entra porque "Oi Maria Aparecida da Silva Santos!" não
       é como gente escreve no WhatsApp. */
    function montarMensagem(modelo, registro) {

        var primeiro = (registro.nome || "").split(" ")[0] || "";

        return String(modelo || "")
            .replace(/\{nome\}/g, registro.nome || "")
            .replace(/\{primeiro\}/g, primeiro)
            .replace(/\{dias\}/g, String(registro.dias));

    }

    function linkWhatsApp(registro, mensagem) {

        if (!registro.telefone.e164) return null;

        return "https://wa.me/" + registro.telefone.e164 +
               "?text=" + encodeURIComponent(mensagem);

    }

    /* Texto colado do Excel: TAB entre colunas. Ponto-e-vírgula e
       vírgula também, porque quem copia de um CSV cola assim — e o
       nome de cliente raramente tem ponto-e-vírgula. */
    function lerTextoColado(texto) {

        return String(texto || "").split("\n").map(function (linha) {
            return linha.trim();
        }).filter(Boolean).map(function (linha) {

            var partes;
            if (linha.indexOf("\t") >= 0) partes = linha.split("\t");
            else if (linha.indexOf(";") >= 0) partes = linha.split(";");
            else partes = linha.split(",");

            return {
                nome: (partes[0] || "").trim(),
                telefone: (partes[1] || "").trim(),
                dias: (partes[2] || "").trim()
            };

        });

    }

    raiz.Reativacao = {
        soDigitos: soDigitos,
        dddValido: dddValido,
        normalizarTelefone: normalizarTelefone,
        comDDD: comDDD,
        formatarTelefone: formatarTelefone,
        tituloDeNome: tituloDeNome,
        montarRegistros: montarRegistros,
        contarPorSituacao: contarPorSituacao,
        montarMensagem: montarMensagem,
        linkWhatsApp: linkWhatsApp,
        lerTextoColado: lerTextoColado
    };

})(typeof globalThis !== "undefined" ? globalThis : window);

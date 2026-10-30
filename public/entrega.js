/* =====================================================
   "VOCÊS ENTREGAM AQUI?" — a faixa de CEP da home
   =====================================================

   O cliente só descobria que está fora da área de entrega DEPOIS de
   montar o carrinho e preencher seis campos. Quem mora longe gastava a
   visita inteira para receber um "não". Esta faixa responde isso na
   primeira tela, com um CEP.

   ELA NÃO COTA O FRETE, E ISSO É MEDIDO, não cautela.

   Geocodifiquei sete CEPs da área duas vezes: uma só com o CEP (a rua
   que o ViaCEP devolve) e outra com o número da casa. A faixa de preço
   bateu em 4 dos 7. Dois erraram feio — um endereço de 3,80 km virava
   5,08 km (R$ 3 virava R$ 5), outro de 6,00 km virava 6,49 km. Um em
   cada três clientes veria um valor aqui e outro no fim do pedido, que
   é exatamente a surpresa que o carrinho foi construído para não dar.

   O que o CEP responde bem é COBERTURA: o erro é de ±1,3 km e o raio
   de entrega é de 8 km, então só quem mora na borda fica em dúvida —
   e para esses a faixa diz que confirma no fim, em vez de chutar.

   A conta exata continua onde sempre esteve: no carrinho, com o número
   da casa. É o que o comentário do calcularFrete já dizia ("não dá
   para calcular só com o CEP"); aqui está o número por trás disso.

   O SEGUNDO MOTIVO desta faixa existir é o endereço ficar guardado. Ele
   não ficava em lugar nenhum: nome, telefone, CEP, rua, número e bairro
   eram redigitados a cada pedido, numa farmácia onde o mesmo cliente
   volta todo mês pelo remédio de uso contínuo. Agora o carrinho abre
   preenchido.

   ONDE O ENDEREÇO FICA: no aparelho do cliente (localStorage), e em
   lugar nenhum além dele. Nada daqui é enviado para o servidor — o que
   vai para a loja continua sendo só o que o cliente confirma ao fechar
   o pedido. Por isso "Trocar" também apaga.
   ===================================================== */
(function () {
    "use strict";

    var DIA = 86400000;
    var VALIDADE = 90 * DIA;

    function slug() {
        try {
            return (typeof LojaAtual !== "undefined" && LojaAtual.slug()) || "casa";
        } catch (e) { return "casa"; }
    }

    /* Por farmácia: o endereço é o mesmo, mas "entregamos aí" é resposta
       de UMA loja. Guardar sem o apelido faria a filial de Diadema
       responder com a conta de São Bernardo — o mesmo defeito que o
       cache do cadastro já teve uma vez. */
    function chave() { return "entrega:" + slug(); }

    function ler() {
        try {
            var cru = localStorage.getItem(chave());
            if (!cru) return null;
            var d = JSON.parse(cru);
            if (!d || !d.cep) return null;
            /* Mudança de endereço acontece. Três meses sem usar e a
               faixa volta a perguntar, em vez de afirmar para sempre. */
            if (Date.now() - (d.quando || 0) > VALIDADE) { apagar(); return null; }
            return d;
        } catch (e) { return null; }
    }

    function gravar(d) {
        try {
            d.quando = Date.now();
            localStorage.setItem(chave(), JSON.stringify(d));
        } catch (e) { /* aba privada, cota cheia: a faixa funciona na sessão */ }
    }

    function apagar() {
        try { localStorage.removeItem(chave()); } catch (e) {}
    }

    /* ---------- consulta ----------

       O Nominatim pede no máximo uma consulta por segundo, e hoje o site
       só o chama no carrinho. Uma faixa na home multiplicaria isso por
       todo visitante, então: a consulta só sai quando a pessoa toca em
       "Definir", e o resultado por CEP fica em cache. Abrir a página não
       consulta nada. */
    var CACHE_CEP = "cep-cache";

    function doCache(cep) {
        try {
            var m = JSON.parse(localStorage.getItem(CACHE_CEP) || "{}");
            var v = m[cep];
            if (v && Date.now() - v.quando < 180 * DIA) return v;
        } catch (e) {}
        return null;
    }

    function paraCache(cep, v) {
        try {
            var m = JSON.parse(localStorage.getItem(CACHE_CEP) || "{}");
            v.quando = Date.now();
            m[cep] = v;
            /* Não deixa crescer sem fim no aparelho de quem usa muito. */
            var chaves = Object.keys(m);
            if (chaves.length > 40) {
                chaves.sort(function (a, b) { return m[a].quando - m[b].quando; });
                chaves.slice(0, chaves.length - 40).forEach(function (k) { delete m[k]; });
            }
            localStorage.setItem(CACHE_CEP, JSON.stringify(m));
        } catch (e) {}
    }

    async function consultar(cep) {
        var guardado = doCache(cep);
        if (guardado) return guardado;

        var via = await fetch("https://viacep.com.br/ws/" + cep + "/json/")
            .then(function (r) { return r.json(); }).catch(function () { return null; });

        if (!via || via.erro) return null;

        var achado = {
            cep: cep,
            logradouro: via.logradouro || "",
            bairro: via.bairro || "",
            cidade: via.localidade || "",
            uf: via.uf || ""
        };

        /* Rua + bairro + cidade, e não `postalcode=`: na medição, o
           índice de CEP do Nominatim no Brasil resolveu 2 de 5, e a
           busca por rua resolveu 6 de 7. */
        if (typeof geocodificar === "function" && achado.cidade) {
            var alvo = [achado.logradouro, achado.bairro, achado.cidade, "Brasil"]
                .filter(Boolean).join(", ");
            try {
                var c = await geocodificar("q=" + encodeURIComponent(alvo));
                if (c) { achado.lat = c.lat; achado.lng = c.lng; }
            } catch (e) { /* sem coordenada, a faixa só mostra o bairro */ }
        }

        paraCache(cep, achado);
        return achado;
    }

    /* ---------- o que a faixa diz ---------- */

    function distancia(d) {
        if (!d || !Number.isFinite(d.lat) || typeof calcularDistanciaKm !== "function") return null;
        if (typeof LOJA_SEM_COORDENADA !== "undefined" && LOJA_SEM_COORDENADA) return null;
        return calcularDistanciaKm(LOJA_LAT, LOJA_LNG, d.lat, d.lng);
    }

    function recado(d) {
        var onde = d.bairro || d.cidade || formatarCep(d.cep);
        var km = distancia(d);

        if (km === null) {
            return { onde: onde, texto: "A loja confirma a entrega com você.", tom: "neutro" };
        }

        var raio = typeof RAIO_MAX_KM !== "undefined" ? RAIO_MAX_KM : 8;

        /* A BORDA. O erro da medição por CEP é de ±1,3 km; afirmar
           dentro dessa margem é chutar. Quem cai aqui recebe um "a
           confirmar" honesto em vez de um "sim" que pode virar não. */
        if (Math.abs(km - raio) <= 1.3) {
            return {
                onde: onde,
                texto: "Você está no limite da nossa área — confirmamos no fim do pedido.",
                tom: "neutro"
            };
        }

        if (km > raio) {
            return {
                onde: onde,
                texto: "Fora da área de entrega. Dá para retirar na loja.",
                tom: "fora"
            };
        }

        /* Dentro: o menor valor da tabela, como PISO e não como cotação.
           O valor exato sai no carrinho, com o número da casa. */
        var piso = typeof calcularValorFrete === "function" ? calcularValorFrete(0) : null;

        return {
            onde: onde,
            texto: piso !== null
                ? "Entregamos aqui — taxa a partir de " + reais(piso) + "."
                : "Entregamos aqui.",
            tom: "dentro"
        };
    }

    function reais(v) {
        return "R$ " + v.toFixed(2).replace(".", ",");
    }

    function formatarCep(c) {
        return String(c || "").replace(/^(\d{5})(\d{3})$/, "$1-$2");
    }

    /* ---------- a faixa na home ----------

       Ela não é uma barra NOVA: é a faixa de recado que já existia,
       trocando o texto genérico ("Entrega rápida em São Bernardo") pelo
       pessoal quando há CEP. Uma faixa só, e nenhum pixel a mais numa
       primeira tela que acabamos de encurtar. */
    var faixa = document.querySelector(".recado-loja");

    function pintar() {
        if (!faixa) return;

        var d = ler();

        if (!d) {
            faixa.classList.remove("recado-pessoal", "recado-fora");
            faixa.innerHTML = faixa.dataset.original || faixa.innerHTML;
            var b = document.createElement("button");
            b.type = "button";
            b.className = "recado-acao";
            b.id = "definirCep";
            b.textContent = "Informe seu CEP";
            faixa.appendChild(b);
            return;
        }

        var r = recado(d);

        faixa.classList.add("recado-pessoal");
        faixa.classList.toggle("recado-fora", r.tom === "fora");
        faixa.innerHTML =
            '<span class="recado-miolo"><strong>' + esc(r.onde) + "</strong> &middot; " +
            esc(formatarCep(d.cep)) + "<br><span class='recado-detalhe'>" +
            esc(r.texto) + "</span></span>" +
            '<button type="button" class="recado-acao" id="definirCep">Trocar</button>';
    }

    function esc(v) {
        return String(v == null ? "" : v)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    /* ---------- a folha de digitar o CEP ---------- */

    var folha = null;

    function fechar() {
        if (!folha) return;
        folha.remove();
        folha = null;
        document.body.classList.remove("com-folha");
    }

    function abrir() {
        fechar();

        var d = ler();

        folha = document.createElement("div");
        folha.className = "cep-folha";
        folha.innerHTML =
            '<div class="cat-fundo" data-fechar="1"></div>' +
            '<div class="cat-painel" role="dialog" aria-modal="true" aria-labelledby="cepTitulo">' +
            '<div class="cat-topo"><strong id="cepTitulo">Entregar em</strong>' +
            '<button class="cat-x" data-fechar="1" aria-label="Fechar">&times;</button></div>' +
            '<div class="cep-corpo">' +
            '<label class="cep-rotulo" for="cepEntrega">Seu CEP</label>' +
            '<input class="cep-campo" id="cepEntrega" type="text" inputmode="numeric" ' +
            'autocomplete="postal-code" maxlength="9" placeholder="00000-000" value="' +
            esc(d ? formatarCep(d.cep) : "") + '">' +
            '<div class="cep-aviso" id="cepAviso" role="status"></div>' +
            '<button type="button" class="cep-ok" id="cepConfirmar">Ver se entregamos</button>' +
            (d ? '<button type="button" class="cep-apagar" id="cepApagar">Apagar meu endereço</button>' : "") +
            '<p class="cep-nota">O valor exato da entrega sai no fim do pedido, ' +
            'com o número da casa. Seu endereço fica só neste aparelho.</p>' +
            "</div></div>";

        document.body.appendChild(folha);
        document.body.classList.add("com-folha");

        var campo = folha.querySelector("#cepEntrega");
        var aviso = folha.querySelector("#cepAviso");

        campo.focus();
        campo.addEventListener("input", function () {
            var n = campo.value.replace(/\D/g, "").slice(0, 8);
            campo.value = n.length > 5 ? n.slice(0, 5) + "-" + n.slice(5) : n;
            aviso.textContent = "";
        });

        campo.addEventListener("keydown", function (ev) {
            if (ev.key === "Enter") { ev.preventDefault(); confirmar(); }
        });

        folha.addEventListener("click", function (ev) {
            if (ev.target.closest("[data-fechar]")) { ev.preventDefault(); fechar(); return; }
            if (ev.target.closest("#cepConfirmar")) { confirmar(); return; }
            if (ev.target.closest("#cepApagar")) { apagar(); pintar(); fechar(); }
        });

        async function confirmar() {
            var cep = campo.value.replace(/\D/g, "");

            if (cep.length !== 8) {
                aviso.textContent = "O CEP tem oito números.";
                aviso.dataset.erro = "1";
                return;
            }

            delete aviso.dataset.erro;
            aviso.textContent = "Procurando...";

            var achado = await consultar(cep);

            if (!achado) {
                aviso.textContent = "Não encontramos esse CEP. Você pode seguir comprando — " +
                    "a entrega é calculada no fim do pedido.";
                aviso.dataset.erro = "1";
                return;
            }

            gravar(achado);
            pintar();
            fechar();
        }
    }

    document.addEventListener("click", function (ev) {
        if (ev.target.closest("#definirCep")) { ev.preventDefault(); abrir(); }
    });

    document.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape") fechar();
    });

    if (faixa) {
        faixa.dataset.original = faixa.innerHTML;
        pintar();
    }

    /* ---------- o carrinho abre preenchido ----------

       A razão pela qual isto vale mais que a faixa: eram seis campos
       redigitados a cada pedido. Preenche e deixa que o cálculo
       automático do script.js faça o resto — não chama calcularFrete
       daqui, porque quem decide quando a conta vale a pena já é o
       agendarCalculoFrete, com a espera e o descarte de resposta velha
       que ele tem e esta função não teria. */
    function preencherCarrinho() {
        var d = ler();
        var campoCep = document.getElementById("cep");

        if (!d || !campoCep || campoCep.value.trim()) return;

        var por = {
            cep: formatarCep(d.cep),
            endereco: d.logradouro,
            bairro: d.bairro,
            cidade: d.cidade
        };

        Object.keys(por).forEach(function (id) {
            var campo = document.getElementById(id);
            if (campo && !campo.value.trim() && por[id]) campo.value = por[id];
        });

        /* Os campos de rua e bairro nascem readonly e o buscarCEP os
           destrava quando o CEP responde. Preenchidos daqui, eles
           precisam do mesmo destravamento - senão o cliente não
           consegue corrigir uma rua errada. */
        ["endereco", "bairro"].forEach(function (id) {
            var campo = document.getElementById(id);
            if (campo && campo.value.trim()) campo.removeAttribute("readonly");
        });

        /* O número NÃO é preenchido: ele não vem do CEP, e inventá-lo
           mandaria o pedido para a casa errada. O foco vai para ele, que
           é exatamente o que falta. */
        var numero = document.getElementById("numero");
        if (numero && !numero.value.trim()) numero.focus();
    }

    if (document.getElementById("cep")) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", preencherCarrinho);
        } else {
            preencherCarrinho();
        }
    }

})();

/* =====================================================================
   Quem é a farmácia — Fase 2 da plataforma multiloja
   =====================================================================

   Até aqui, endereço, CNPJ, CRF da farmacêutica, telefone, coordenadas,
   raio de entrega e horário estavam escritos em 29 lugares, dentro de 6
   arquivos. Cadastrar a segunda farmácia era copiar o site e trocar 29
   valores na mão — e errar um significa publicar o CRF de uma
   farmacêutica na porta de outra farmácia. Isso não é bug de software,
   é problema sanitário.

   Agora a fonte da verdade é a tabela `lojas` no D1, e este arquivo é
   quem a traz para a tela.

   POR QUE O HTML CONTINUA COM OS VALORES ESCRITOS

   O rodapé de todas as páginas continua trazendo o endereço completo no
   HTML, e não um espaço em branco esperando JavaScript. Três motivos, e
   nenhum deles é preguiça:

     1. o Google lê o rodapé para saber onde a farmácia fica — é parte do
        que coloca a loja no resultado local;
     2. a página abre com a informação certa já no primeiro quadro, sem
        piscar;
     3. se a API cair, o site continua mostrando endereço e telefone, que
        é justamente o que o cliente precisa quando quer falar com a
        loja.

   Então o que vem da API SOBRESCREVE o que está no HTML, em vez de
   preencher o vazio. O preço disso é poder haver divergência entre os
   dois — e por isso o teste-loja.mjs, no repositório do padronizador,
   compara valor por valor e falha se alguém mudar um lado só.

   Quando a segunda loja existir, quem vai escrever o rodapé é a função
   da Pages, no servidor, lendo a loja do caminho (seção 8 do
   PLATAFORMA-MULTILOJA.md). Aí este arquivo vira só o que sobra: o
   horário e os links de WhatsApp.
   ===================================================================== */

/* O espelho do que está no HTML hoje. Serve de rede: se a API não
   responder, nada na tela muda em relação ao que já existia. */
const LOJA_PADRAO = {
    slug: "mais-barato",
    nome: "Drogaria Mais Barato",
    cnpj: "37.925.108/0001-03",
    logradouro: "Rua Almeida Leme",
    numero: "07",
    complemento: "Loja 1",
    bairro: "Parque São Bernardo",
    cidade: "São Bernardo do Campo",
    uf: "SP",
    cep: "09761-170",
    latitude: -23.7092450,
    longitude: -46.5251954,
    whatsapp: "5511925190101",
    farmaceutico: "Dra. Laís Carvalho da Silva",
    crf: "122886",
    rotulo_responsavel: "Farmacêutica responsável",
    autorizacao: "Processo 25351.507967/2022-82",
    licenca_ms: "MS 7.89888-2",
    raio_entrega_km: 8,
    frete_gratis_acima: 0,
    fuso: "America/Sao_Paulo"
};

/* Domingo é 0, como no getDay() do JavaScript e como na tabela. */
const HORARIO_PADRAO = [
    { dia: 0, abre: "08:00", fecha: "19:30" },
    { dia: 1, abre: "07:00", fecha: "21:30" },
    { dia: 2, abre: "07:00", fecha: "21:30" },
    { dia: 3, abre: "07:00", fecha: "21:30" },
    { dia: 4, abre: "07:00", fecha: "21:30" },
    { dia: 5, abre: "07:00", fecha: "21:30" },
    { dia: 6, abre: "07:00", fecha: "21:30" }
];

let LOJA = { ...LOJA_PADRAO };
let HORARIO_LOJA = [...HORARIO_PADRAO];

/* Logotipo e cor. Nulo é o caso da farmácia que usa a marca padrão. */
let VISUAL = null;

const CACHE_LOJA = "loja-v1";
const CACHE_LOJA_MS = 60 * 60 * 1000;   // uma hora

/* Onde pedir o cadastro quando o script.js NÃO está na página.

   Em toda página de venda, o endereço do worker vem do script.js, que
   já está carregado. A página de políticas é a exceção: ela não vende
   nada e carregar o script.js ali custaria o download do catálogo
   inteiro — 2,6 MB para ler um texto.

   Sem este endereço, aquela página ficaria com os dados escritos no
   HTML, que são os da PRIMEIRA farmácia. Ou seja: a política de
   privacidade de uma filial publicaria o CNPJ e a licença sanitária da
   farmácia vizinha. É o mesmo defeito que já apareceu no rodapé, e num
   documento jurídico é pior.

   O teste-politicas.mjs compara esta linha com a do script.js e falha
   se as duas divergirem. */
const API_LOJA_SEM_SCRIPT = "https://farmatech-pedidos-proxy.zaureliojr.workers.dev";

/* ---------------------------------------------------------------------
   HORÁRIO
   ------------------------------------------------------------------ */

/* Que horas são NA LOJA, não no relógio de quem está olhando.

   Parece preciosismo com uma farmácia só em São Bernardo, mas o Brasil
   tem quatro fusos e a rede pode ter unidade em Mato Grosso. Com o
   relógio do visitante, um cliente em Cuiabá veria "Fechado" numa loja
   paulista aberta — e desistiria do pedido.

   Se o navegador não souber lidar com fuso (muito antigo), cai no
   relógio local, que é exatamente o comportamento de antes. */
function agoraNaLoja() {
    try {
        const partes = new Intl.DateTimeFormat("en-US", {
            timeZone: LOJA.fuso || "America/Sao_Paulo",
            weekday: "short",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23"
        }).formatToParts(new Date());

        const campo = Object.fromEntries(partes.map((p) => [p.type, p.value]));
        const dias = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

        return {
            dia: dias[campo.weekday],
            minutos: Number(campo.hour) * 60 + Number(campo.minute)
        };
    } catch (erro) {
        const agora = new Date();
        return { dia: agora.getDay(), minutos: agora.getHours() * 60 + agora.getMinutes() };
    }
}

function emMinutos(hhmm) {
    const [h, m] = String(hhmm || "").split(":");
    return Number(h) * 60 + Number(m || 0);
}

/* As faixas de hoje. São várias quando a loja fecha para almoço — por
   isso a tabela aceita mais de uma linha por dia. */
function faixasDoDia(dia) {
    return HORARIO_LOJA
        .filter((f) => Number(f.dia) === Number(dia))
        .sort((a, b) => emMinutos(a.abre) - emMinutos(b.abre));
}

function lojaAbertaAgora() {
    const { dia, minutos } = agoraNaLoja();
    return faixasDoDia(dia).some(
        (f) => minutos >= emMinutos(f.abre) && minutos < emMinutos(f.fecha)
    );
}

/* "7h" / "7h30" — do jeito que se fala, não "07:00". */
function falarHora(hhmm) {
    const [h, m] = String(hhmm || "").split(":");
    return Number(m) ? `${Number(h)}h${m}` : `${Number(h)}h`;
}

/* A que horas abre hoje, para a frase "Fechado agora. Abrimos às 7h". */
function proximaAberturaDeHoje() {
    const { dia, minutos } = agoraNaLoja();
    const faixa = faixasDoDia(dia).find((f) => minutos < emMinutos(f.abre));
    return faixa ? falarHora(faixa.abre) : "";
}

/* ---------------------------------------------------------------------
   APLICAR NA TELA
   ------------------------------------------------------------------ */

function enderecoCompleto(l) {
    const linha1 = [l.logradouro, l.numero].filter(Boolean).join(" ");
    const comComplemento = l.complemento ? `${linha1} – ${l.complemento}` : linha1;
    const cep = l.cep ? `CEP ${l.cep}` : "";
    return [comComplemento, l.bairro, `${l.cidade} – ${l.uf}`, cep]
        .filter(Boolean).join(", ");
}

/* A cara da farmácia: logotipo e cor.

   As duas são opcionais — sem elas, vale a marca padrão, que é o que
   está no HTML e no style.css.

   A cor vem UMA só, e as variações saem dela aqui, com proporção fixa:
   a clara é sempre quase branca (serve de fundo para texto escuro) e a
   escura é sempre mais escura que a principal. Deixar a loja escolher as
   quatro pareceria mais flexível e seria pior — é assim que se publica
   texto azul-escuro sobre fundo azul-escuro. Com a derivação, o
   contraste é garantido por construção.

   Navegador antigo sem color-mix ignora as declarações que não entende,
   uma a uma, e fica com a cor padrão. Degrada para "site da marca
   original", não para site quebrado. */
function aplicarMarca(visual) {
    if (!visual) return;

    if (visual.logo) {
        document.querySelectorAll('img[data-loja="logo"]').forEach((img) => {
            img.setAttribute("src", visual.logo);
        });
    }

    /* Só #rrggbb entra. O valor vai para dentro de uma folha de estilo —
       o worker já valida, e validar de novo aqui é o que impede que um
       dado estragado no banco vire CSS arbitrário na página. */
    if (visual.cor && /^#[0-9a-f]{6}$/i.test(visual.cor)) {
        let estilo = document.getElementById("corDaLoja");
        if (!estilo) {
            estilo = document.createElement("style");
            estilo.id = "corDaLoja";
            document.head.appendChild(estilo);
        }
        estilo.textContent = `:root{
            --marca: ${visual.cor};
            --marca-escura: color-mix(in srgb, ${visual.cor} 70%, #000);
            --marca-clara: color-mix(in srgb, ${visual.cor} 12%, #fff);
            --marca-xclara: color-mix(in srgb, ${visual.cor} 5%, #fff);
        }`;

        const tema = document.querySelector('meta[name="theme-color"]');
        if (tema) tema.setAttribute("content", visual.cor);
    }
}

function aplicarNaPagina() {
    const l = LOJA;

    /* ESCREVE SEMPRE, inclusive o vazio — e esse "inclusive" é o
       conserto de um defeito que só apareceu com a segunda farmácia no
       ar.

       Antes, campo vazio fazia a função voltar sem escrever, deixando
       na tela o que estava no HTML. Parecia conservador e era o
       contrário: o HTML traz os dados da PRIMEIRA farmácia, porque é
       dela o arquivo servido na raiz. Então a filial cadastrada sem
       autorização sanitária publicava, no rodapé dela, o número de
       processo e a licença da OUTRA — um documento de outro
       estabelecimento, no site de uma farmácia. O mesmo valia para a
       farmacêutica e o CRF.

       O HTML continua sendo a rede de segurança para quando a API NÃO
       RESPONDE: aí esta função nem chega a rodar. Mas quando ela
       responde, o que ela disser é a verdade — inclusive o silêncio.

       Vazio esconde a linha em vez de deixá-la em branco: um parágrafo
       vazio no rodapé abre um buraco que parece defeito de layout. */
    const escrever = (campo, texto) => {
        document.querySelectorAll(`[data-loja="${campo}"]`)
            .forEach((el) => {
                el.textContent = texto || "";
                el.hidden = !texto;
            });
    };

    /* O CNPJ como a farmácia o escreve na nota: 00.000.000/0000-00.

       Quem cadastra digita como vem à mão — uns com pontuação, outros
       só os 14 dígitos —, e "CNPJ 31175246000128" no rodapé de um site
       de farmácia parece dado importado errado. Com pontuação a mais ou
       de outro tamanho, fica como está: inventar formato em cima de um
       número que não reconheço é pior que mostrar o que foi digitado. */
    const cnpjLegivel = (valor) => {
        const digitos = String(valor || "").replace(/\D/g, "");
        if (digitos.length !== 14) return String(valor || "");
        return digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
                               "$1.$2.$3/$4-$5");
    };

    escrever("identificacao",
        l.cnpj ? `${l.nome} · CNPJ ${cnpjLegivel(l.cnpj)}` : l.nome);
    escrever("endereco", enderecoCompleto(l));
    /* O rótulo vem da loja. Escrever "Farmacêutica responsável" aqui
       dentro obrigaria a deduzir, do primeiro nome, como a pessoa se
       identifica — e o resultado dessa dedução fica impresso no rodapé
       de todas as páginas, ao lado do CRF dela. Quem cadastra a loja
       escreve. */
    escrever("responsavel",
        l.farmaceutico
            ? `${l.rotulo_responsavel || "Farmacêutico(a) responsável"}: ${l.farmaceutico}${l.crf ? ` – CRF ${l.crf}` : ""}`
            : "");
    /* Campos usados pelas páginas de política, onde o texto é corrido e
       precisa do nome da farmácia no meio da frase — não do bloco
       "nome · CNPJ" do rodapé.

       Cada um carrega a FRASE INTEIRA, com rótulo e ponto final, e não
       só o valor. Parece verboso e é o que torna o esconder seguro:
       `escrever` apaga o elemento quando o dado falta, e um pedaço solto
       deixaria "foro da comarca de ." publicado na política de uma
       filial cadastrada sem cidade. Com a frase dentro, o que desaparece
       é o parágrafo. */
    escrever("nome", l.nome || "");
    escrever("cnpj", l.cnpj ? `CNPJ ${cnpjLegivel(l.cnpj)}` : "");
    escrever("entrega-raio",
        Number.isFinite(l.raio_entrega_km) && l.raio_entrega_km > 0
            ? `Entregamos dentro de um raio de ${String(l.raio_entrega_km).replace(".", ",")} km do endereço da loja. Fora dele, o pedido pode ser retirado no balcão.`
            : "");
    /* "Entrega rápida em Diadema", na primeira linha da home.

       Sem cidade cadastrada, o trecho some e fica só "Entrega rápida",
       que continua sendo uma frase. É por isso que ele é um `span`
       separado e não parte do mesmo texto: o que desaparece é o
       complemento, não a frase inteira. */
    escrever("cidade-entrega", l.cidade ? `em ${l.cidade}` : "");

    escrever("foro",
        l.cidade
            ? `Fica eleito o foro da comarca de ${[l.cidade, l.uf].filter(Boolean).join(" – ")} para as questões decorrentes destes termos, sem prejuízo do direito do consumidor de demandar no foro do seu domicílio.`
            : "");

    escrever("autorizacao",
        l.autorizacao ? `Autorização: ${l.autorizacao}${l.licenca_ms ? ` · ${l.licenca_ms}` : ""}` : "");

    /* Os links de WhatsApp da loja. Troca só o número e preserva a
       mensagem pronta de cada botão, que é diferente em cada página
       ("quero fazer um pedido", "vi o encarte"...). O link da DrogaLink
       no rodapé não tem este atributo e fica como está — é o nosso
       contato, não o da farmácia. */
    if (l.whatsapp) {
        document.querySelectorAll('a[data-loja="whatsapp"]').forEach((a) => {
            try {
                const url = new URL(a.getAttribute("href"), location.href);
                url.pathname = "/" + l.whatsapp;
                a.setAttribute("href", url.toString());
            } catch (erro) {
                /* href estranho: melhor deixar o que estava do que
                   devolver um link quebrado. */
            }
        });
    }

    /* As constantes do script.js. São `let` justamente para isto.
       Trocadas aqui, o cálculo de frete e os links de pedido passam a
       usar o que está no banco sem que nenhuma outra função saiba que
       alguma coisa mudou. */
    if (typeof WHATS_LOJA !== "undefined" && l.whatsapp) WHATS_LOJA = l.whatsapp;

    /* A coordenada da loja, e a recusa de usar a da vizinha.

       Antes era só `if (Number.isFinite(...)) LOJA_LAT = ...`, que
       parece a cautela certa e é o contrário: coordenada ausente fazia
       a linha não rodar, e o que ficava valendo era a constante escrita
       no script.js — a da PRIMEIRA farmácia.

       Resultado visto no ar: a filial de Diadema calculava a taxa de
       entrega de cada cliente a partir da loja de São Bernardo. Nada
       falhava; a tela mostrava uma distância, uma taxa e um "dentro da
       área de entrega" perfeitamente formatados, todos contra o
       endereço errado.

       É a mesma armadilha do rodapé, que publicava a licença sanitária
       da vizinha quando a filial não tinha a dela. A diferença é que no
       rodapé o erro era visível para quem conhecia as duas lojas; aqui
       ele sai em dinheiro, na conta de um cliente que não tem como
       desconfiar. */
    const temCoordenada = Number.isFinite(l.latitude) && Number.isFinite(l.longitude);

    if (typeof LOJA_SEM_COORDENADA !== "undefined") LOJA_SEM_COORDENADA = !temCoordenada;

    if (temCoordenada) {
        if (typeof LOJA_LAT !== "undefined") LOJA_LAT = l.latitude;
        if (typeof LOJA_LNG !== "undefined") LOJA_LNG = l.longitude;
    } else {
        /* Vale um aviso no console: quem abrir o site da filial para
           entender por que a taxa não calcula encontra a resposta no
           primeiro lugar em que vai olhar. */
        console.info(
            `A loja "${l.slug || "?"}" está cadastrada sem latitude/longitude. ` +
            "A taxa de entrega não será calculada automaticamente — preencha " +
            "as coordenadas na aba Filiais do painel."
        );
    }
    if (typeof RAIO_MAX_KM !== "undefined" && Number.isFinite(l.raio_entrega_km)) RAIO_MAX_KM = l.raio_entrega_km;
    if (typeof FRETE_GRATIS_ACIMA_DE !== "undefined" && Number.isFinite(l.frete_gratis_acima)) {
        FRETE_GRATIS_ACIMA_DE = l.frete_gratis_acima;
    }

    aplicarMarca(VISUAL);

    /* Quem desenha horário na tela redesenha agora, com o dado novo. */
    if (typeof atualizarStatusLoja === "function") atualizarStatusLoja();
    document.dispatchEvent(new CustomEvent("lojaPronta", { detail: { loja: LOJA } }));
}

/* ---------------------------------------------------------------------
   CARREGAR
   ------------------------------------------------------------------ */

function lerCacheLoja() {
    try {
        const bruto = sessionStorage.getItem(CACHE_LOJA);
        if (!bruto) return null;
        const { quando, dados } = JSON.parse(bruto);
        if (Date.now() - quando > CACHE_LOJA_MS) return null;
        return dados;
    } catch (erro) {
        return null;
    }
}

async function carregarLoja() {
    const base = (typeof API_PEDIDOS_D1 !== "undefined" && API_PEDIDOS_D1)
        ? API_PEDIDOS_D1
        : API_LOJA_SEM_SCRIPT;
    if (!base) return;

    const guardado = lerCacheLoja();
    if (guardado) {
        adotar(guardado);
        return;
    }

    try {
        const resposta = await fetch(LojaAtual.api(base, "/loja"));
        if (!resposta.ok) throw new Error("HTTP " + resposta.status);

        const dados = await resposta.json();
        if (!dados || !dados.loja) throw new Error("resposta sem loja");

        try {
            sessionStorage.setItem(CACHE_LOJA, JSON.stringify({ quando: Date.now(), dados }));
        } catch (erro) {
            /* sessionStorage cheio ou bloqueado: segue sem cache. */
        }

        adotar(dados);

    } catch (erro) {
        /* Silencioso de propósito. O HTML já traz o endereço certo e as
           constantes já têm os valores certos — o visitante não perde
           nada, e um aviso vermelho no console de uma farmácia não ajuda
           ninguém. Vira console.info para quem estiver depurando. */
        console.info("Cadastro da loja não carregou; usando o que está na página.", erro.message);
    }
}

/* O que a LOJA_PADRAO pode emprestar a OUTRA farmácia, e o que não.

   O padrão existe como rede: sem rede, sem API, a instalação de uma
   loja só continua de pé. O problema é que ele é o cadastro da
   PRIMEIRA farmácia, e o espalhamento `{...LOJA_PADRAO, ...resposta}`
   empresta à filial tudo que a resposta não trouxer.

   Três defeitos desta sessão saíram dessa mesma linha, e todos com a
   mesma cara — nada falha, a tela fica bonita, e o dado é de outro
   estabelecimento:

     - o rodapé da filial publicando o processo de autorização
       sanitária e a licença MS da farmácia vizinha;
     - a taxa de entrega de Diadema medida a partir de São Bernardo;
     - "Entrega em até 2 horas em São Bernardo do Campo" na primeira
       linha do site de Diadema.

   Os três foram consertados um a um. Esta lista fecha a porta: quando
   a resposta é de uma farmácia DIFERENTE da do padrão, nada que
   identifique estabelecimento é herdado. Campo que falta vira vazio, e
   vazio o resto do código já sabe esconder.

   O que continua sendo herdado é o que não identifica ninguém: fuso,
   raio de entrega e piso de frete grátis — ter um valor de operação
   razoável é melhor que não ter nenhum. */
const SO_DESTA_FARMACIA = [
    "nome", "razao_social", "cnpj",
    "logradouro", "numero", "complemento", "bairro", "cidade", "uf", "cep",
    "latitude", "longitude",
    "whatsapp", "telefone", "email",
    "farmaceutico", "crf", "rotulo_responsavel",
    "autorizacao", "licenca_ms"
];

function adotar(dados) {

    const vinda = dados.loja || {};

    /* Mesma farmácia do padrão (a instalação de uma loja só, e a
       própria farmácia principal): o padrão vale inteiro, como sempre
       valeu. */
    const base = { ...LOJA_PADRAO };

    if (vinda.slug && vinda.slug !== LOJA_PADRAO.slug) {
        SO_DESTA_FARMACIA.forEach((campo) => { base[campo] = ""; });
    }

    LOJA = { ...base, ...vinda };
    if (Array.isArray(dados.horario) && dados.horario.length) HORARIO_LOJA = dados.horario;
    VISUAL = dados.visual || null;
    aplicarNaPagina();
}

document.addEventListener("DOMContentLoaded", carregarLoja);

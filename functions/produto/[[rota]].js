/* =====================================================================
   Página de produto com meta por produto — /produto/<nome>-<ean>
   =====================================================================

   O PROBLEMA QUE ISTO RESOLVE

   Até aqui as 6.785 páginas de produto tinham o mesmo <title>
   ("Produto — Drogaria Mais Barato") e a mesma descrição. O nome do
   remédio só aparecia depois que o JavaScript baixava o catálogo e
   desenhava a tela. Consequência prática: no Google as páginas competiam
   entre si com título idêntico, e um link colado no WhatsApp mostrava
   "Produto" em vez de "Dipirona 500mg" — sem foto.

   POR QUE O NOME VEM DA PRÓPRIA URL, E NÃO DO CATÁLOGO

   O caminho óbvio seria esta função baixar o produtos.json e procurar o
   produto. Medimos antes de escrever:

       tamanho do catálogo:         2,62 MB
       JSON.parse:                  19,7 ms
       limite de CPU do plano Free: 10 ms por requisição

   Ou seja, só LER o catálogo custa o dobro do orçamento de CPU da
   requisição inteira — e isso antes de montar qualquer HTML. Parsear a
   cada visita derrubaria a página.

   Então nada é consultado. Tudo que a função precisa está na URL:

       /produto/dipirona-sodica-500mg-20-comprimidos-7891234567890
                └──────────── nome ────────────────┘ └─── EAN ───┘

   O nome sai do trecho de texto. A foto sai do EAN, porque o endereço
   da imagem é determinístico: o proxy de imagens é indexado por código
   de barras. Nenhuma rede, nenhum parse, CPU perto de zero.

   O EAN serve de identificador porque medimos isso também: 6.834 EANs
   para 6.855 produtos, zero repetidos — e o próprio site já descarta
   produto sem EAN antes de mostrar (script.js, filtro do carregar()).

   O QUE SE PERDE, E POR QUE ESTÁ BOM

   Desslugificar perde acento: "Solução" volta como "Solucao". Isso
   afeta 17% dos nomes, e o estrago é menor do que parece — a descrição
   vem do PDV já sem acento na maioria dos casos ("Efervescente Limao").
   Mais importante: o produto.js corrige o <title> com o nome real
   quando o catálogo chega, e o Google executa o JavaScript. O que a
   função entrega é a linha de base, que existe antes de qualquer
   script e é a única coisa que o WhatsApp e o Facebook leem.

   CUIDADO AO EDITAR

   A página vive num endereço com DUAS barras (/produto/algo), mas o
   produto.html é escrito como se estivesse na raiz (href="style.css").
   Deixado assim, o navegador pediria /produto/style.css e a tela sairia
   sem CSS. É por isso que o reescritor absolutiza href/src — e é por
   isso que ele NÃO mexe em <use href="#ic-...">: aquilo é âncora para o
   sprite dentro do próprio documento. Os endereços montados em tempo de
   execução pelo script.js foram passados para a raiz ("/carrinho.html")
   pelo mesmo motivo.
   ===================================================================== */

const LOJA = "Drogaria Mais Barato";
const PROXY_IMAGENS = "https://farmatech-imagens-proxy.zaureliojr.workers.dev";

/* Quanto o Google mostra de uma descrição antes de cortar. Montar já no
   tamanho certo é melhor que entregar um parágrafo e deixar a busca
   decidir onde truncar — ela corta no meio da palavra. */
const MAX_DESCRICAO = 158;

/* Separa "nome-do-produto-7891234567890" em nome e EAN.

   Âncora no FIM da string e exige de 8 a 14 dígitos: é o formato de
   código de barras (EAN-8 a GTIN-14). Preso ao fim, um nome que termine
   em número ("50x2") não é confundido com o código. */
function separar(rota) {
    const achado = /^(.*?)-?(\d{8,14})$/.exec(rota);
    if (!achado) return { nome: "", ean: "" };
    return { nome: achado[1] || "", ean: achado[2] };
}

/* "dipirona-sodica-500mg" -> "Dipirona Sodica 500mg"

   Palavra que começa com dígito fica como está: "500mg" virar "500Mg"
   seria pior que o original. */
function desslugificar(slug) {
    return String(slug)
        .split("-")
        .filter(Boolean)
        .map((palavra) => (/^\d/.test(palavra) ? palavra : palavra.charAt(0).toUpperCase() + palavra.slice(1)))
        .join(" ");
}

function cortar(texto, limite) {
    if (texto.length <= limite) return texto;
    const pedaco = texto.slice(0, limite - 1);
    const espaco = pedaco.lastIndexOf(" ");
    return (espaco > limite * 0.6 ? pedaco.slice(0, espaco) : pedaco) + "…";
}

function escapar(texto) {
    return String(texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/* Troca o texto de um elemento inteiro de uma vez.

   O HTMLRewriter entrega texto em pedaços, e um <title> pode chegar em
   dois. Escrever no primeiro pedaço e apagar os seguintes é o padrão
   para não acabar com o título duplicado. */
class TrocarTexto {
    constructor(novo) {
        this.novo = novo;
        this.escreveu = false;
    }
    text(pedaco) {
        if (!this.escreveu) {
            pedaco.replace(this.novo);
            this.escreveu = true;
        } else {
            pedaco.remove();
        }
        if (pedaco.lastInTextNode) this.escreveu = false;
    }
}

/* Deixa href/src apontando para a raiz. Só mexe no que é relativo:
   endereço absoluto, protocolo, "//" e âncora ficam intactos. */
class ParaRaiz {
    constructor(atributo) {
        this.atributo = atributo;
    }
    element(elemento) {
        const valor = elemento.getAttribute(this.atributo);
        if (!valor) return;
        if (/^([a-z][a-z0-9+.-]*:|\/\/|\/|#|\?)/i.test(valor)) return;
        elemento.setAttribute(this.atributo, "/" + valor);
    }
}

export async function onRequest({ request, env, params }) {
    const url = new URL(request.url);
    const origem = url.origin;

    const rota = Array.isArray(params.rota) ? params.rota.join("/") : (params.rota || "");
    const { nome: slug, ean } = separar(decodeURIComponent(rota));

    /* O produto.html continua sendo o arquivo servido: a função só
       reescreve a cabeça. Assim a página é a mesma do /produto.html
       antigo, com o mesmo script e o mesmo comportamento. */
    let pagina = await env.ASSETS.fetch(new Request(`${origem}/produto.html`, { redirect: "follow" }));

    /* A Pages responde 308 em /produto.html e manda para /produto — o
       mesmo que já acontece com /painel.html. O redirect:"follow" acima
       resolve isso sozinho, mas se a configuração de html_handling
       mudar um dia, esta segunda tentativa evita a página em branco. */
    if (!pagina.ok) {
        pagina = await env.ASSETS.fetch(new Request(`${origem}/produto`, { redirect: "follow" }));
    }

    if (!pagina.ok) {
        /* Sem a casca não há o que reescrever. Devolve como veio em vez
           de inventar uma página de erro própria. */
        return pagina;
    }

    const nome = slug ? desslugificar(slug) : "";
    const titulo = nome ? `${nome} — ${LOJA}` : `Produto — ${LOJA}`;

    const descricao = nome
        ? cortar(
            `${nome}. Compre na ${LOJA}, em São Bernardo do Campo, com entrega em até 2 horas. Veja preço e foto.`,
            MAX_DESCRICAO
        )
        : `Detalhes do produto — ${LOJA}`;

    /* Canônico sem query: a mesma página responde em /produto?codigo=
       (links antigos) e no endereço com nome. Apontar os dois para este
       endereço é o que evita o Google tratar como páginas diferentes. */
    const canonico = ean ? `${origem}/produto/${slug ? slug + "-" : ""}${ean}` : `${origem}/produto`;

    /* Duas og:image, nesta ordem: a foto do produto e, atrás dela, a
       caixa neutra. 220 dos 6.785 produtos não têm foto no acervo, e
       nesses o endereço do proxy responde 404 — sem a segunda linha o
       link no WhatsApp sairia sem imagem nenhuma. Os leitores de OG
       usam a primeira que carrega. */
    const imagens = ean
        ? [`${PROXY_IMAGENS}/${ean}`, `${origem}/sem-imagem.webp`]
        : [`${origem}/logo.png`];

    const trilha = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
            { "@type": "ListItem", position: 1, name: "Início", item: origem + "/" },
            ...(nome ? [{ "@type": "ListItem", position: 2, name: nome, item: canonico }] : [])
        ]
    };

    const cabeca = `
  <link rel="canonical" href="${escapar(canonico)}">
  <meta property="og:type" content="product">
  <meta property="og:site_name" content="${LOJA}">
  <meta property="og:locale" content="pt_BR">
  <meta property="og:title" content="${escapar(titulo)}">
  <meta property="og:description" content="${escapar(descricao)}">
  <meta property="og:url" content="${escapar(canonico)}">
${imagens.map((i) => `  <meta property="og:image" content="${escapar(i)}">`).join("\n")}
  <meta property="og:image:alt" content="${escapar(nome || "Produto")}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapar(titulo)}">
  <meta name="twitter:description" content="${escapar(descricao)}">
  <script type="application/ld+json">${JSON.stringify(trilha)}</script>
`;

    const reescrito = new HTMLRewriter()
        .on("title", new TrocarTexto(titulo))
        .on('meta[name="description"]', {
            element: (e) => e.setAttribute("content", descricao)
        })
        .on("link[href]", new ParaRaiz("href"))
        .on("script[src]", new ParaRaiz("src"))
        .on("img[src]", new ParaRaiz("src"))
        .on("a[href]", new ParaRaiz("href"))
        .on("head", {
            element: (e) => e.append(cabeca, { html: true })
        })
        .transform(pagina);

    const cabecalhos = new Headers(reescrito.headers);
    cabecalhos.set("Content-Type", "text/html; charset=utf-8");
    /* Guardar na borda é o que mantém o custo de CPU irrelevante: a
       casca da página não muda entre visitas, e preço e estoque não vêm
       daqui — vêm do produtos.json, que nunca é cacheado. */
    cabecalhos.set("Cache-Control", "public, max-age=60, s-maxage=3600");

    return new Response(reescrito.body, { status: 200, headers: cabecalhos });
}

/* =====================================================================
   A cabeça da página de produto, nas duas rotas que existem
   =====================================================================

   O site tem dois endereços para o mesmo produto, e é de propósito:

     /produto/<nome>-<ean>               a página canônica, do produto
     /loja/<slug>/produto/<nome>-<ean>   a página de compra, da farmácia

   POR QUE DOIS

   O plano é marketplace: várias farmácias no mesmo domínio. Se cada uma
   gerasse a sua página do mesmo remédio, dez lojas dariam dez páginas
   quase idênticas de Dipirona competindo entre si. O Google trata isso
   como conteúdo duplicado e escolhe uma — ou nenhuma. E a autoridade que
   deveria estar numa página fica dividida em dez.

   Com uma página canônica por produto e as variantes por loja apontando
   para ela, o problema não nasce.

   A variante não leva `noindex`. Parece que levaria — o documento da
   plataforma diz "fora do índice" —, mas `noindex` junto com `canonical`
   são instruções que se contradizem, e o Google avisa que nesses casos
   pode acabar tirando as duas páginas. O `canonical` sozinho já faz o
   que se quer: a busca consolida na página do produto e mostra ela.

   O ARQUIVO É O MESMO

   As duas rotas servem o mesmo produto.html. O que muda é a cabeça:
   título, descrição, canônico. O corpo é desenhado pelo produto.js, que
   lê a loja do próprio caminho.

   E NADA AQUI LÊ O CATÁLOGO

   Medido antes de desenhar: o produtos.json tem 2,62 MB e o JSON.parse
   dele custa 19,7 ms, contra 10 ms de CPU por requisição no plano Free
   da Pages. Só ler o catálogo gastaria o dobro do orçamento da
   requisição inteira. Então tudo vem da URL — o nome do trecho de texto,
   a foto do EAN, porque o endereço no proxy de imagens é determinístico.

   CUIDADO AO EDITAR

   A página de compra vive num endereço de QUATRO barras
   (/loja/x/produto/y) e o produto.html é escrito como se estivesse na
   raiz (href="style.css"). Sem tratamento o navegador pediria
   /loja/x/produto/style.css. É por isso que o reescritor absolutiza
   href/src — e por isso que ele NÃO toca em <use href="#ic-...">, que é
   âncora para o sprite dentro do próprio documento.
   ===================================================================== */

const MARCA = "Drogaria Mais Barato";

/* Onde fica o worker que sabe das lojas.

   Vinha escrito à mão em dois arquivos. Virou configurável por um motivo
   prático antes de qualquer outro: sem isso não há como testar o caminho
   do catálogo por loja sem publicar o worker primeiro — e um caminho que
   só dá para testar em produção é um caminho que não se testa.

   O padrão é o endereço de verdade, então nada muda sem a variável. */
export function porteiro(env) {
    return String((env && env.PEDIDOS_PROXY_URL) || "https://farmatech-pedidos-proxy.zaureliojr.workers.dev")
        .replace(/\/+$/, "");
}

/* Quanto o Google mostra de uma descrição antes de cortar. */
const MAX_DESCRICAO = 158;

/* Separa "nome-do-produto-7891234567890" em nome e EAN.

   Âncora no FIM e exige de 8 a 14 dígitos: é o formato de código de
   barras (EAN-8 a GTIN-14). Preso ao fim, um nome que termine em número
   ("50x2") não é confundido com o código. */
export function separar(rota) {
    const achado = /^(.*?)-?(\d{8,14})$/.exec(rota);
    if (!achado) return { nome: "", ean: "" };
    return { nome: achado[1] || "", ean: achado[2] };
}

/* "dipirona-sodica-500mg" -> "Dipirona Sodica 500mg"

   Palavra que começa com dígito fica como está: "500mg" virar "500Mg"
   seria pior que o original. */
export function desslugificar(slug) {
    return String(slug)
        .split("-")
        .filter(Boolean)
        .map((p) => (/^\d/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
        .join(" ");
}

function cortar(texto, limite) {
    if (texto.length <= limite) return texto;
    const pedaco = texto.slice(0, limite - 1);
    const espaco = pedaco.lastIndexOf(" ");
    return (espaco > limite * 0.6 ? pedaco.slice(0, espaco) : pedaco) + "…";
}

export function escapar(texto) {
    return String(texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/* Troca o texto de um elemento inteiro de uma vez.

   O HTMLRewriter entrega texto em pedaços, e um <title> pode chegar em
   dois. Escrever no primeiro e apagar os seguintes é o padrão para não
   acabar com o título duplicado. */
export class TrocarTexto {
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
export class ParaRaiz {
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

/* Busca a casca. É sempre o produto.html, nas duas rotas. */
export async function cascaDoProduto(env, origem) {
    let pagina = await env.ASSETS.fetch(new Request(`${origem}/produto.html`, { redirect: "follow" }));

    /* A Pages responde 308 em /produto.html e manda para /produto — o
       mesmo que acontece com /painel.html. O redirect:"follow" resolve
       sozinho; esta segunda tentativa cobre uma eventual mudança de
       html_handling. */
    if (!pagina.ok) {
        pagina = await env.ASSETS.fetch(new Request(`${origem}/produto`, { redirect: "follow" }));
    }
    return pagina;
}

/* O nome da farmácia e o catálogo dela.

   Uma subrequisição ao worker, que responde com cache de 5 minutos. É
   tempo de espera, não de CPU — e o cacheEverything faz a borda
   responder sem sair de casa na quase totalidade das vezes.

   O CATÁLOGO é o que mais importa aqui, e não o nome. Cada farmácia
   publica o seu arquivo de produtos; sem o endereço certo, quem abre um
   link de compra compartilhado no WhatsApp veria o PREÇO DA OUTRA LOJA —
   com cara de certo, que é o pior jeito de errar preço.

   Se a consulta falhar, o nome cai no slug desslugificado ("farma-centro"
   vira "Farma Centro", feio mas não errado) e o catálogo fica vazio, o
   que faz a página usar o da farmácia original. Preço de outra loja por
   falha de rede é ruim; nenhuma página abrindo é pior. */
export async function dadosDaLoja(slug, env) {
    if (!slug) return { nome: "", catalogo: "" };
    try {
        const resposta = await fetch(
            `${porteiro(env)}/loja?slug=${encodeURIComponent(slug)}`,
            { cf: { cacheTtl: 300, cacheEverything: true } }
        );
        if (resposta.ok) {
            const dados = await resposta.json();
            return {
                nome: (dados && dados.loja && dados.loja.nome) || desslugificar(slug),
                catalogo: (dados && dados.catalogo) || ""
            };
        }
    } catch (erro) {
        console.error("dadosDaLoja:", erro);
    }
    return { nome: desslugificar(slug), catalogo: "" };
}

/* ---------------------------------------------------------------------
   A função que as duas rotas chamam
   ------------------------------------------------------------------ */

export async function montarPaginaProduto({ request, env, rota, slugLoja = "", nomeLoja = "", catalogo = "", proprio = false }) {
    const url = new URL(request.url);
    const origem = url.origin;

    const { nome: slug, ean } = separar(decodeURIComponent(rota || ""));

    const pagina = await cascaDoProduto(env, origem);
    if (!pagina.ok) return pagina;

    const nome = slug ? desslugificar(slug) : "";
    const caminhoProduto = ean ? `/produto/${slug ? slug + "-" : ""}${ean}` : "/produto";

    /* O canônico depende de ONDE a página está sendo servida.

       Na plataforma, é sempre a página do produto sem loja — é a linha
       que faz dez farmácias no mesmo domínio não competirem entre si.

       No domínio DA FARMÁCIA, a página dela é canônica de si mesma.
       Apontar para a plataforma empurraria para o nosso domínio tudo
       que ela construir no Google, que é o contrário de dar um endereço
       a ela — e a primeira coisa que a dona de uma rede pergunta é
       justamente de quem é o endereço. */
    const canonico = proprio ? origem + url.pathname : origem + caminhoProduto;

    const daLoja = !!slugLoja;
    const marca = daLoja && nomeLoja ? nomeLoja : MARCA;

    const titulo = nome ? `${nome} — ${marca}` : `Produto — ${marca}`;

    const descricao = nome
        ? cortar(
            daLoja
                ? `${nome}. Compre na ${marca} com entrega rápida. Veja preço, foto e disponibilidade.`
                : `${nome}. Veja preço, foto e em quais farmácias comprar, com entrega rápida.`,
            MAX_DESCRICAO
        )
        : `Detalhes do produto — ${marca}`;

    /* UMA og:image só, e ela nunca falha.

       A primeira versão declarava duas — a foto no proxy e, atrás dela,
       a caixa genérica, para os 220 produtos sem foto. A suposição era
       que o leitor usasse a primeira que carregasse. Mandei um link de
       Aspirina no WhatsApp e veio a caixa genérica, com a foto no ar e
       perfeita: o leitor escolheu a outra. O /og/<ean> decide no
       servidor, e o leitor não tem o que escolher. */
    const imagem = ean ? `${origem}/og/${ean}` : `${origem}/logo.png`;

    /* A trilha muda entre as duas rotas, e é a única coisa na cabeça que
       fala da loja na página de compra — o resto aponta para o produto. */
    const trilha = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
            { "@type": "ListItem", position: 1, name: "Início", item: origem + "/" },
            ...(daLoja
                ? [{ "@type": "ListItem", position: 2, name: marca,
                     item: proprio ? origem + "/" : `${origem}/loja/${slugLoja}` }]
                : []),
            ...(nome
                ? [{ "@type": "ListItem", position: daLoja ? 3 : 2, name: nome, item: url.origin + url.pathname }]
                : [])
        ]
    };

    /* Qual catálogo esta página lê. Só na página de compra: a canônica
       fala do produto, não de uma farmácia, e usa o da casa.

       O filtro de endereço é obrigatório — este valor vira <meta> numa
       página do nosso domínio, e o script.js baixa de lá. */
    const metaCatalogo = (slugLoja && /^https:\/\/raw\.githubusercontent\.com\//.test(catalogo))
        ? `\n  <meta name="catalogo" content="${escapar(catalogo)}">`
        : "";

    /* A mesma marca da vitrine: no domínio da farmácia, os links de
       produto desta página saem no endereço curto, sem o 301 no meio. */
    const metaPropria = proprio && slugLoja
        ? `\n  <meta name="loja-propria" content="${escapar(slugLoja)}">`
        : "";

    const cabeca = `${metaCatalogo}${metaPropria}
  <link rel="canonical" href="${escapar(canonico)}">
  <meta property="og:type" content="product">
  <meta property="og:site_name" content="${escapar(marca)}">
  <meta property="og:locale" content="pt_BR">
  <meta property="og:title" content="${escapar(titulo)}">
  <meta property="og:description" content="${escapar(descricao)}">
  <meta property="og:url" content="${escapar(origem + url.pathname)}">
  <meta property="og:image" content="${escapar(imagem)}">
  <meta property="og:image:alt" content="${escapar(nome || "Produto")}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapar(titulo)}">
  <meta name="twitter:description" content="${escapar(descricao)}">
  <script type="application/ld+json">${JSON.stringify(trilha)}</script>
`;

    const reescrito = new HTMLRewriter()
        .on("title", new TrocarTexto(titulo))
        .on('meta[name="description"]', { element: (e) => e.setAttribute("content", descricao) })
        .on("link[href]", new ParaRaiz("href"))
        .on("script[src]", new ParaRaiz("src"))
        .on("img[src]", new ParaRaiz("src"))
        .on("a[href]", new ParaRaiz("href"))
        /* De qual farmácia é esta página, para o JavaScript do site.
           Sem isto, quem chega pela página de um produto compartilhado
           no WhatsApp põe no carrinho e manda o pedido para a fila da
           farmácia principal, e não da que ele estava vendo. */
        .on('meta[name="loja"]', {
            element: (e) => e.setAttribute("content", slugLoja || "")
        })
        .on("head", { element: (e) => e.append(cabeca, { html: true }) })
        .transform(pagina);

    const cabecalhos = new Headers(reescrito.headers);
    cabecalhos.set("Content-Type", "text/html; charset=utf-8");
    /* Guardar na borda é o que mantém o custo de CPU irrelevante: a casca
       não muda entre visitas, e preço e estoque não vêm daqui — vêm do
       produtos.json, que nunca é cacheado. */
    cabecalhos.set("Cache-Control", "public, max-age=60, s-maxage=3600");

    return new Response(reescrito.body, { status: 200, headers: cabecalhos });
}

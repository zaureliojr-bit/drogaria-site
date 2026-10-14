/* A vitrine de uma farmácia — /loja/<slug>

   É a página que responde pela busca que vale dinheiro para farmácia de
   bairro: "farmácia perto de mim", "farmácia aberta agora em São
   Bernardo". Quem responde por ela não é a página de um remédio — é a
   página do lugar, com endereço, horário e telefone em dado estruturado.

   Serve o mesmo index.html da home. O que muda é a cabeça: título,
   descrição, canônico e, principalmente, o bloco de `Pharmacy` — que no
   HTML está escrito com os dados da Drogaria Mais Barato e aqui é
   substituído pelos da loja do caminho. Sem essa substituição, a segunda
   farmácia da rede publicaria o endereço e o CRF da primeira, o que não
   é bug de software, é problema sanitário.

   Por que /loja/<slug> e não /<slug>, como o documento da plataforma
   previa: um arquivo de função na raiz (functions/[[slug]].js) captura
   TODOS os caminhos do site, e na Pages a função tem prioridade sobre o
   arquivo estático — /style.css e /logo.png passariam por ela. Trocar
   esse risco por uma barra a menos no endereço não paga. */

import { escapar, TrocarTexto, ParaRaiz } from "../../_paginaProduto.js";

const PROXY = "https://farmatech-pedidos-proxy.zaureliojr.workers.dev";

const DIAS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function onRequest({ request, env, params }) {
    const url = new URL(request.url);
    const origem = url.origin;

    const slug = String(params.slug || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);
    if (!slug) return Response.redirect(origem + "/", 302);

    /* A loja vem do worker, com cache de 5 minutos na borda. Aqui, ao
       contrário da página de produto, a consulta é obrigatória: a página
       inteira fala de uma farmácia específica, e servi-la com os dados de
       outra é pior do que não servi-la. */
    let loja;
    let horario = [];
    try {
        const resposta = await fetch(`${PROXY}/loja?slug=${encodeURIComponent(slug)}`, {
            cf: { cacheTtl: 300, cacheEverything: true }
        });
        if (resposta.status === 404) {
            return new Response("Farmácia não encontrada.", {
                status: 404,
                headers: { "Content-Type": "text/plain; charset=utf-8" }
            });
        }
        if (!resposta.ok) throw new Error("HTTP " + resposta.status);

        const dados = await resposta.json();
        loja = dados.loja;
        horario = dados.horario || [];
        if (!loja) throw new Error("resposta sem loja");

    } catch (erro) {
        console.error("vitrine:", erro);
        /* Cadastro fora do ar: manda para a home, que funciona sem ele,
           em vez de mostrar uma página de erro. */
        return Response.redirect(origem + "/", 302);
    }

    const pagina = await env.ASSETS.fetch(new Request(origem + "/index.html", { redirect: "follow" }));
    if (!pagina.ok) return pagina;

    const endereco = [
        [loja.logradouro, loja.numero].filter(Boolean).join(", "),
        loja.complemento
    ].filter(Boolean).join(" - ");

    const canonico = `${origem}/loja/${slug}`;
    const titulo = `${loja.nome} — ${loja.cidade}/${loja.uf}`;
    const descricao =
        `${loja.nome} em ${loja.cidade}. ${endereco}. Medicamentos, perfumaria e higiene ` +
        `com entrega rápida. Veja preços e peça pelo site.`;

    /* Uma OpeningHoursSpecification por faixa de horário. Agrupar dias
       iguais deixaria o JSON menor, mas a conta de agrupar é onde entra
       erro, e o Google aceita a lista solta sem reclamar. */
    const aberturas = horario.map((h) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: DIAS[Number(h.dia)] || "Monday",
        opens: h.abre,
        closes: h.fecha
    }));

    const farmacia = {
        "@context": "https://schema.org",
        "@type": "Pharmacy",
        name: loja.nome,
        url: canonico,
        image: `${origem}/logo.png`,
        telephone: loja.telefone || undefined,
        priceRange: "$",
        currenciesAccepted: "BRL",
        address: {
            "@type": "PostalAddress",
            streetAddress: endereco,
            addressLocality: loja.cidade,
            addressRegion: loja.uf,
            postalCode: loja.cep,
            addressCountry: "BR"
        },
        geo: Number.isFinite(loja.latitude) && Number.isFinite(loja.longitude)
            ? { "@type": "GeoCoordinates", latitude: loja.latitude, longitude: loja.longitude }
            : undefined,
        openingHoursSpecification: aberturas.length ? aberturas : undefined,
        areaServed: loja.cidade ? { "@type": "City", name: loja.cidade } : undefined
    };

    const cabeca = `
  <link rel="canonical" href="${escapar(canonico)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${escapar(loja.nome)}">
  <meta property="og:locale" content="pt_BR">
  <meta property="og:title" content="${escapar(titulo)}">
  <meta property="og:description" content="${escapar(descricao)}">
  <meta property="og:url" content="${escapar(canonico)}">
  <meta property="og:image" content="${origem}/logo.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapar(titulo)}">
  <meta name="twitter:description" content="${escapar(descricao)}">
`;

    const reescrito = new HTMLRewriter()
        .on("title", new TrocarTexto(titulo))
        .on('meta[name="description"]', { element: (e) => e.setAttribute("content", descricao) })
        /* O index.html já traz canônico, og: e twitter: — todos da home e
           da Mais Barato. Acrescentar os desta loja por cima deixaria DOIS
           canônicos na mesma página, e duas instruções contraditórias é o
           mesmo que nenhuma: o Google ignora as duas. Então os antigos
           saem antes de os novos entrarem. */
        /* A vitrine vive em /loja/<slug>, duas barras fundo, e o
           index.html é escrito como se estivesse na raiz (href="style.css",
           src="logo.png"). Sem isto o navegador pede /loja/style.css e a
           página da farmácia abre sem CSS e sem JavaScript. Foi o teste
           de navegador que pegou: no servidor, a página respondia 200 e
           parecia perfeita. */
        .on("link[href]", new ParaRaiz("href"))
        .on("script[src]", new ParaRaiz("src"))
        .on("img[src]", new ParaRaiz("src"))
        .on("a[href]", new ParaRaiz("href"))
        .on('link[rel="canonical"]', { element: (e) => e.remove() })
        .on('meta[property^="og:"]', { element: (e) => e.remove() })
        .on('meta[name^="twitter:"]', { element: (e) => e.remove() })
        /* O Pharmacy do HTML é o da Mais Barato. Aqui ele é trocado pelo
           da loja do caminho — o atributo data-loja-jsonld no index.html
           existe só para este seletor poder achá-lo sem confundir com o
           bloco de WebSite, que fica ao lado. */
        .on("script[data-loja-jsonld]", {
            element: (e) => e.setInnerContent(JSON.stringify(farmacia), { html: true })
        })
        .on("head", { element: (e) => e.append(cabeca, { html: true }) })
        .transform(pagina);

    const cabecalhos = new Headers(reescrito.headers);
    cabecalhos.set("Content-Type", "text/html; charset=utf-8");
    cabecalhos.set("Cache-Control", "public, max-age=60, s-maxage=300");

    return new Response(reescrito.body, { status: 200, headers: cabecalhos });
}

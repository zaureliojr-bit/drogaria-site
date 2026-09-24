/* =====================================================
   Service worker — Drogaria Mais Barato
   =====================================================

   Existe por dois motivos, nessa ordem:

   1. Sem service worker registrado o Chrome não oferece "instalar".
      É requisito da plataforma, não escolha nossa.
   2. Offline, a casca do site ainda abre e mostra o aviso de "não foi
      possível carregar os produtos" em vez do dinossauro do navegador.

   O que ele NÃO faz, de propósito: acelerar. A estratégia é rede
   primeiro em tudo, e o cache só entra quando a rede falha. Numa
   drogaria, servir um preço guardado de ontem é pior do que demorar
   300ms a mais — e uma publicação nova precisa chegar no cliente na
   primeira vez que ele abrir, não na segunda.
   ===================================================== */

const CACHE = "mais-barato-casca-v4";

/* Só a casca. "/index.html" fica de fora porque o Cloudflare Pages
   responde 308 nele e redireciona para "/", e resposta de redirecionamento
   não pode ser guardada no cache. Pelo mesmo motivo o painel entra como
   "/painel", e não "/painel.html". */
const CASCA = [
  "/",
  "/style.css",
  "/script.js",
  "/produto.html",
  "/produto.js",
  "/carrinho.html",
  "/carrinho.js",
  "/oferta",
  "/oferta.js",
  "/painel",
  "/manifest-painel.json",
  "/logo.png",
  "/icone-192.png",
  "/icone-512.png",
  "/sem-imagem.webp",
  "/sem-imagem-neutra.webp"
];

/* Nunca entram no cache: tarjas.json decide se o produto pede receita e
   produtos.json traz preço e estoque. Desatualizados, os dois dariam
   informação errada sobre medicamento.

   O painel SAIU desta lista. Ele estava aqui por "é a tela da loja, com
   senha" — mas o que protege o painel é a senha, não a ausência do
   arquivo: o HTML é só a casca, e sem a senha ele mostra a tela de
   login e mais nada. Os pedidos e os clientes vêm da API em tempo real,
   e a API continua exigindo a chave. Guardar a casca é o que permite
   instalar o painel como aplicativo no balcão — e é justamente no
   balcão que a conexão cai. */
const NUNCA_GUARDAR = ["/tarjas.json", "/produtos.json"];

self.addEventListener("install", (evento) => {
  evento.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // um por um, cada um com seu catch: se um arquivo faltar, os outros
    // ainda entram. Com addAll, um 404 derruba a instalação inteira.
    await Promise.all(CASCA.map((url) => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(
      nomes.filter((nome) => nome !== CACHE).map((nome) => caches.delete(nome))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (evento) => {
  const requisicao = evento.request;

  if (requisicao.method !== "GET") return;

  const url = new URL(requisicao.url);

  // Fora do nosso domínio não é conosco: o catálogo vem do GitHub, as
  // fotos do proxy de imagens e os pedidos do worker do D1. Deixa passar
  // direto, sem interceptar.
  if (url.origin !== self.location.origin) return;

  if (NUNCA_GUARDAR.some((caminho) => url.pathname.startsWith(caminho))) return;

  evento.respondWith((async () => {
    try {
      const resposta = await fetch(requisicao);

      // "basic" = mesma origem e sem redirecionamento. Guardar resposta
      // opaca ou redirecionada dá erro na hora de servir de volta.
      if (resposta && resposta.ok && resposta.type === "basic") {
        const cache = await caches.open(CACHE);
        cache.put(requisicao, resposta.clone());
      }

      return resposta;

    } catch (erro) {

      const guardado = await caches.match(requisicao);
      if (guardado) return guardado;

      // Sem rede e sem cópia da página pedida, devolve a home: pelo menos
      // abre alguma coisa em vez da tela de erro do navegador.
      if (requisicao.mode === "navigate") {
        const casa = await caches.match("/");
        if (casa) return casa;
      }

      throw erro;
    }
  })());
});

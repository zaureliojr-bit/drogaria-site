/* A página de compra — /loja/<slug>/produto/<nome>-<ean>

   É onde o cliente vê o preço daquela farmácia e põe no carrinho. É para
   cá que apontam os cards da vitrine.

   Não vai para o sitemap e não disputa o Google: o rel=canonical dela
   aponta para /produto/<nome>-<ean>, e é lá que a busca consolida. Com
   dez farmácias, sem isso, seriam dez páginas de Dipirona competindo
   entre si no mesmo domínio.

   O título leva o nome da farmácia, e não o do slug: quem compartilha
   este link no WhatsApp está mandando "o preço na MINHA farmácia", e a
   prévia precisa dizer qual. */

import { montarPaginaProduto, nomeDaLoja } from "../../../_paginaProduto.js";

export async function onRequest({ request, env, params }) {
    const rota = Array.isArray(params.rota) ? params.rota.join("/") : (params.rota || "");

    /* Só letra minúscula, número e hífen. O slug entra na página e vira
       texto do título — tratar como texto de estranho é o mínimo. */
    const slugLoja = String(params.slug || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);

    if (!slugLoja) {
        return Response.redirect(new URL("/produto/" + rota, request.url).toString(), 302);
    }

    const nomeLoja = await nomeDaLoja(slugLoja, env);

    return montarPaginaProduto({ request, env, rota, slugLoja, nomeLoja });
}

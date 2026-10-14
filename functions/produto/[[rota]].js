/* A página canônica do produto — /produto/<nome>-<ean>

   É esta que vai para o sitemap e é esta que o Google mostra. Ela fala do
   PRODUTO, não de uma farmácia: o endereço não tem loja, e a página de
   compra de cada loja aponta para cá com rel=canonical.

   Essa divisão é o que permite dez farmácias no mesmo domínio sem que
   dez páginas quase idênticas de Dipirona disputem entre si — ver o
   comentário longo em ../_paginaProduto.js, que é onde mora a lógica.

   Esta rota também atende os endereços antigos: /produto?codigo=000123,
   e /produto.html?codigo=, que a Pages redireciona para cá. */

import { montarPaginaProduto } from "../_paginaProduto.js";

export async function onRequest({ request, env, params }) {
    const rota = Array.isArray(params.rota) ? params.rota.join("/") : (params.rota || "");
    return montarPaginaProduto({ request, env, rota });
}

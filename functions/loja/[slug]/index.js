/* A vitrine na plataforma — /loja/<slug>

   O trabalho está em ../../_vitrine.js, porque o mesmo desenho responde
   em dois endereços: aqui e na raiz do domínio próprio da farmácia (ver
   functions/_middleware.js). Manter em dois lugares é como eles
   divergem.

   Por que /loja/<slug> e não /<slug>: um arquivo de função na raiz
   (functions/[[slug]].js) captura TODOS os caminhos do site, e na Pages
   a função tem prioridade sobre o arquivo estático — /style.css e
   /logo.png passariam por ela. */

import { montarVitrine } from "../../_vitrine.js";

export async function onRequest({ request, env, params }) {
    return montarVitrine({ request, env, slug: params.slug });
}

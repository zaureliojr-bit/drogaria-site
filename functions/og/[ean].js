/* =====================================================================
   A foto que vai na prévia do link — /og/<ean>
   =====================================================================

   POR QUE ESTE ARQUIVO EXISTE

   A página do produto declarava DUAS og:image: a foto no proxy e, atrás
   dela, a caixa genérica, para o caso de o produto não ter foto. A ideia
   era que o leitor usasse a primeira que carregasse.

   Não é o que acontece. Mandei um link de Aspirina no WhatsApp e a
   prévia veio com a caixa genérica — a foto existia, estava no ar, JPEG
   de 250x250 e 19 KB. O leitor simplesmente escolheu a outra. "Primeira
   que carregar" era suposição minha, não regra do protocolo.

   Então agora é UMA og:image só, e ela nunca falha: este endereço
   devolve a foto do produto quando existe, e a caixa genérica quando
   não existe. Quem decide é o servidor, não o leitor.

   CUSTO

   Uma subrequisição e nenhum processamento: o corpo da resposta é
   repassado como veio (stream), sem ler nem copiar. É o tipo de trabalho
   que não encosta no limite de 10 ms de CPU do plano Free.

   E só o robô do WhatsApp, do Facebook e do Google passa por aqui. O
   <img> da página continua indo direto ao proxy — não faria sentido
   acrescentar um salto para 6.800 fotos por visita.
   ===================================================================== */

const PROXY_IMAGENS = "https://farmatech-imagens-proxy.zaureliojr.workers.dev";

/* A mesma caixa que a vitrine mostra no lugar de foto que falta. É .webp
   e o WhatsApp renderiza sem problema — foi justamente ela que apareceu
   na prévia errada que originou este arquivo. */
const SEM_FOTO = "/sem-imagem.webp";

export async function onRequest({ request, env, params }) {
    const origem = new URL(request.url).origin;

    /* Só dígito, no máximo 14. O que chega aqui é parte de um endereço
       público: vale tratar como texto de estranho, não como EAN. */
    const ean = String(params.ean || "").replace(/\D/g, "").slice(0, 14);

    async function caixaGenerica() {
        const resposta = await env.ASSETS.fetch(new Request(origem + SEM_FOTO));
        return new Response(resposta.body, {
            status: 200,
            headers: {
                "Content-Type": resposta.headers.get("content-type") || "image/webp",
                /* Cache curto, ao contrário da foto: produto sem foto hoje
                   ganha foto quando o padronizador roda, e a prévia deve
                   acompanhar sem esperar um dia. */
                "Cache-Control": "public, max-age=3600"
            }
        });
    }

    if (ean.length < 8) return caixaGenerica();

    let foto;
    try {
        foto = await fetch(`${PROXY_IMAGENS}/${ean}`, {
            cf: { cacheTtl: 86400, cacheEverything: true }
        });
    } catch (erro) {
        /* Proxy fora do ar não pode virar link sem imagem nenhuma. */
        console.error("og:", erro);
        return caixaGenerica();
    }

    const tipo = foto.headers.get("content-type") || "";

    /* Confere o tipo, e não só o status: uma resposta 200 de texto
       ("não encontrado", uma página de erro) viraria prévia quebrada, e
       o 404 do proxy já foi visto respondendo assim em outras rotas. */
    if (!foto.ok || !tipo.startsWith("image/")) return caixaGenerica();

    return new Response(foto.body, {
        status: 200,
        headers: {
            "Content-Type": tipo,
            "Cache-Control": "public, max-age=86400"
        }
    });
}

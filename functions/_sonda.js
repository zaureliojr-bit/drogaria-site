/* Sonda descartável: existe só para confirmar que a Pages está lendo a
   pasta /functions deste repositório. Sai assim que a resposta vier. */
export function onRequest() {
    return new Response("functions-ok", {
        headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" }
    });
}

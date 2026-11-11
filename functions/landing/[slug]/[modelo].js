import { porteiro } from "../../_paginaProduto.js";
import { renderLanding, renderLandingPromo } from "../../../public/gerador-landing.js";

const MAX_BYTES = 12 * 1024 * 1024;
const TEXTOS = {
    titulo: 100, selo: 60, promessa: 250, entrega: 120,
    validoAte: 20, tagAds: 30, conversaoWhatsapp: 120
};
const IMAGEM = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

function erro(mensagem, status) {
    return Response.json({ erro: mensagem }, { status, headers: { "Cache-Control": "no-store" } });
}

function texto(valor, limite) {
    return typeof valor === "string" ? valor.trim().slice(0, limite) : "";
}

export async function onRequest({ request, env, params }) {
    const { slug, modelo } = params;
    if (!/^[a-z0-9-]{1,80}$/.test(slug) || !["padrao", "promo"].includes(modelo)) {
        return erro("Página não encontrada.", 404);
    }
    const chave = "landings/" + slug + "/" + modelo + ".html";
    const bucket = env.LANDING_PAGES;
    if (request.method === "GET" || request.method === "HEAD") {
        const pagina = bucket && await bucket.get(chave);
        if (!pagina) return erro("Página ainda não publicada.", 404);
        return new Response(request.method === "HEAD" ? null : pagina.body, {
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://*.drogalink.com.br https://drogaria-site.pages.dev https://www.google.com https://www.googleadservices.com https://*.doubleclick.net; script-src 'unsafe-inline' https://www.googletagmanager.com https://www.googleadservices.com https://www.google.com; connect-src https://*.google.com https://*.googleadservices.com https://*.doubleclick.net https://www.googletagmanager.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Expose-Headers": "X-Landing-Version",
                "X-Landing-Version": pagina.etag
            }
        });
    }
    if (request.method !== "POST") return erro("Método não permitido.", 405);
    if (request.headers.get("Origin") !== new URL(request.url).origin) return erro("Origem inválida.", 403);
    const senha = request.headers.get("X-Painel-Key");
    if (!senha) return erro("Entre no painel para publicar.", 401);
    try {
        const api = porteiro(env);
        const headers = { "X-Painel-Key": senha, "X-Painel-Loja": slug };
        const acesso = await fetch(api + "/sessao", { headers });
        if (acesso.status === 429) return erro("Aguarde antes de tentar novamente.", 429);
        if (!acesso.ok || !(await acesso.json()).dono) return erro("Somente o dono da plataforma pode publicar.", 403);
        if (!bucket) return erro("A publicação aguarda a configuração do armazenamento no Cloudflare Pages.", 503);
        const filial = await fetch(api + "/loja?slug=" + encodeURIComponent(slug), { headers });
        if (!filial.ok) return erro("Não consegui carregar a filial.", 404);
        const { loja, horario } = await filial.json();
        if (!loja?.nome) return erro("Filial inválida.", 404);

        const raw = await request.text();
        if (raw.length > MAX_BYTES || new TextEncoder().encode(raw).length > MAX_BYTES) {
            return erro("As imagens da página excedem o limite de publicação.", 413);
        }
        const entrada = JSON.parse(raw);
        if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) return erro("Dados inválidos.", 400);
        const dias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
        const prefixo = slug === "prudente-01" ? "mb-prudente" : slug;
        const dominio = env.DOMINIO_PLATAFORMA || "drogalink.com.br";
        const origemFilial = "https://" + prefixo + "." + dominio;
        const origemPlataforma = "https://drogaria-site.pages.dev";
        const origem = entrada.dominioProprio === true ? origemFilial : origemPlataforma;
        const dados = {
            nome: loja.nome,
            whatsapp: loja.whatsapp,
            catalogo: origem === origemFilial ? origem + "/" : origem + "/loja/" + slug,
            endereco: [[loja.logradouro, loja.numero].filter(Boolean).join(", "), loja.complemento, loja.bairro,
                [loja.cidade, loja.uf].filter(Boolean).join("/")].filter(Boolean).join(" · "),
            horario: (horario || []).map(h => dias[h.dia] + " " + h.abre + "–" + h.fecha).join(" · "),
            responsavel: loja.farmaceutico, crf: loja.crf, cnpj: loja.cnpj
        };
        for (const [campo, limite] of Object.entries(TEXTOS)) dados[campo] = texto(entrada[campo], limite);
        for (const i of [1, 2, 3, 4]) {
            dados["ofertaNome" + i] = texto(entrada["ofertaNome" + i], 100);
            dados["ofertaTag" + i] = texto(entrada["ofertaTag" + i], 35);
            dados["ofertaTexto" + i] = texto(entrada["ofertaTexto" + i], 150);
            const imagem = entrada["ofertaImagem" + i];
            if (typeof imagem === "string" && imagem.length < 2796300 && IMAGEM.test(imagem)) {
                dados["ofertaImagem" + i] = imagem;
            }
        }
        let html;
        try {
            html = modelo === "promo" ? renderLandingPromo(dados) : renderLanding(dados);
        } catch (e) {
            return erro(e.message, 400);
        }
        const pagina = await bucket.put(chave, html);
        if (!pagina) return erro("Não consegui gravar a página.", 503);
        const caminho = "/landing/" + slug + "/" + modelo;
        return Response.json({ url: origem + caminho, alternativa: origemPlataforma + caminho, versao: pagina.etag });
    } catch (e) {
        return e instanceof SyntaxError ? erro("Dados de publicação inválidos.", 400) : erro("Não consegui publicar a página. Tente novamente.", 502);
    }
}

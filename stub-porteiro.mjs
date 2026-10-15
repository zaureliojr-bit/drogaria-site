/* Um porteiro de mentira, para testar o caminho do catálogo por loja sem
   publicar o worker antes.

   Existe porque as funções da Pages consultam o worker do SERVIDOR, e
   page.route do Playwright só intercepta o que o navegador pede — o que
   acontece dentro da função é invisível para ele. Sem este stub, a única
   forma de exercitar "cada farmácia lê o catálogo dela" seria publicar e
   torcer.

   Uso:
     node stub-porteiro.mjs &
     npx wrangler pages dev public --port 8817 \
       --binding PEDIDOS_PROXY_URL=http://127.0.0.1:8899
*/

import { createServer } from "node:http";

const PORTA = Number(process.env.PORTA_STUB || 8899);

const BASE = "https://raw.githubusercontent.com/zaureliojr-bit/Produtos/refs/heads/main/";

/* A primeira farmácia é a que existia antes da plataforma: o catálogo
   dela continua em produtos.json, sem sufixo. */
const LOJAS = {
    "mais-barato": {
        loja: { slug: "mais-barato", nome: "Drogaria Mais Barato", cidade: "São Bernardo do Campo",
                uf: "SP", telefone: "+5511925190101", cep: "09761-170",
                logradouro: "Rua Almeida Leme", numero: "07", complemento: "Loja 1",
                latitude: -23.709245, longitude: -46.5251954, ativo: 1 },
        horario: [0, 1, 2, 3, 4, 5, 6].map((dia) => ({ dia, abre: "07:00", fecha: "21:30" })),
        visual: null,
        catalogo: BASE + "produtos.json"
    },
    "farma-centro": {
        loja: { slug: "farma-centro", nome: "Farmácia do Centro", cidade: "Cuiabá",
                uf: "MT", telefone: "+5565999887766", cep: "78005-370",
                logradouro: "Avenida Getúlio Vargas", numero: "1500", complemento: "",
                latitude: -15.601411, longitude: -56.097892, ativo: 1 },
        horario: [0, 1, 2, 3, 4, 5, 6].map((dia) => ({ dia, abre: "08:00", fecha: "20:00" })),
        visual: { logo: "https://exemplo.test/logo-centro.png", cor: "#0a7d4b" },
        catalogo: BASE + "produtos-farma-centro.json"
    }
};

createServer((pedido, resposta) => {
    const url = new URL(pedido.url, "http://localhost");

    if (url.pathname !== "/loja") {
        resposta.writeHead(404, { "Content-Type": "application/json" });
        return resposta.end(JSON.stringify({ erro: "Rota não encontrada." }));
    }

    const slug = url.searchParams.get("slug") || "mais-barato";
    const dados = LOJAS[slug];

    if (!dados) {
        resposta.writeHead(404, { "Content-Type": "application/json" });
        return resposta.end(JSON.stringify({ erro: "Loja não encontrada." }));
    }

    resposta.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    resposta.end(JSON.stringify(dados));
}).listen(PORTA, "127.0.0.1", () => {
    console.log(`porteiro de mentira em http://127.0.0.1:${PORTA}`);
});

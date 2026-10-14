/* O bug: a Pages redireciona /painel.html para /painel, então uma regra
   escrita no nome do arquivo nunca casa. Este teste pede a URL CURTA,
   que é a que o navegador realmente usa. */
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = "/home/user/drogaria-site/public";
let falhas = 0;
const ok = m => console.log("   ✓", m);
const nao = m => { falhas++; console.log("   ✗", m); };

function lerHeaders() {
  const txt = fs.readFileSync(path.join(RAIZ, "_headers"), "utf8");
  const blocos = []; let atual = null;
  for (const l of txt.split("\n")) {
    if (!l.trim() || l.trim().startsWith("#")) continue;
    if (!/^\s/.test(l)) { atual = { padrao: l.trim(), headers: {} }; blocos.push(atual); }
    else if (atual) { const i = l.indexOf(":");
      if (i > 0) atual.headers[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }
  }
  return blocos;
}

const blocos = lerHeaders();
const para = rota => {
  let s = {};
  for (const b of blocos) if (b.padrao === "/*" || b.padrao === rota) Object.assign(s, b.headers);
  return s;
};

console.log("blocos:", blocos.map(b => b.padrao).join(" , "));

const PADRONIZADOR = "https://farmatech-padronizador.zaureliojr.workers.dev";

for (const rota of ["/painel", "/painel.html"]) {
  console.log(`\n--- ${rota} ---`);
  const csp = para(rota)["Content-Security-Policy"] || "";

  const script = (csp.match(/script-src ([^;]*)/) || [])[1] || "";
  script.includes(PADRONIZADOR)
    ? ok("script-src autoriza o padronizador") : nao("script-src BLOQUEIA o padronizador: " + script);

  const frame = (csp.match(/frame-src ([^;]*)/) || [])[1] || "";
  frame.includes(PADRONIZADOR)
    ? ok("frame-src autoriza o quadro") : nao("frame-src bloqueia o quadro: " + frame);

  const connect = (csp.match(/connect-src ([^;]*)/) || [])[1] || "";
  connect.includes("publish-proxy")
    ? ok("connect-src alcança o publish-proxy") : nao("connect-src sem publish-proxy");

  /\bframe-ancestors 'none'/.test(csp)
    ? ok("frame-ancestors 'none' continua") : nao("perdeu o frame-ancestors");
}

console.log("\n--- a vitrine NÃO pode ter as folgas do painel ---");
{
  const csp = para("/index.html")["Content-Security-Policy"] || "";
  !csp.includes(PADRONIZADOR)
    ? ok("a home não autoriza o padronizador") : nao("a folga do painel vazou para a vitrine");
  /frame-src 'none'/.test(csp) ? ok("frame-src 'none' na vitrine") : nao("vitrine com frame-src aberto");
}

console.log("\n" + (falhas ? falhas + " FALHA(S)" : "tudo passou"));
process.exit(falhas ? 1 : 0);

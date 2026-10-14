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
  txt.split("\n").forEach((l) => {
    if (!l.trim() || l.trim().startsWith("#")) return;
    if (!/^\s/.test(l)) { atual = { padrao: l.trim(), headers: {} }; blocos.push(atual); }
    else if (atual) {
      const corte = l.trim();
      /* "! Nome" apaga o cabecalho que uma regra anterior definiu. Sem
         isto o teste nao reproduz a Pages e passa com o bug em pe. */
      if (corte.startsWith("!")) { atual.remover = atual.remover || []; atual.remover.push(corte.slice(1).trim()); return; }
      const i = l.indexOf(":");
      if (i > 0) atual.headers[l.slice(0, i).trim()] = l.slice(i + 1).trim();
    }
  });
  return blocos;
}

const blocos = lerHeaders();
/* Junta as regras como a Pages junta: na ordem, apagando o que o "!"
   mandar apagar antes de aplicar o que a regra define. */
const para = rota => {
  let s = {};
  for (const b of blocos) {
    if (b.padrao !== "/*" && b.padrao !== rota) continue;
    for (const nome of (b.remover || [])) delete s[nome];
    Object.assign(s, b.headers);
  }
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

console.log("\n--- o CSP do painel tem de SUBSTITUIR, não somar ---");
{
  /* Esta é a verificação que faltava. Sem o "!", a Pages manda os DOIS
     cabeçalhos CSP e o navegador exige que o recurso passe nos dois —
     a regra restritiva do /* continua valendo e o padronizador segue
     bloqueado, mesmo com a regra de baixo autorizando. O resultado
     final da junção parece certo em memória, então só olhar o CSP
     montado não pega: tem de olhar o "!". */
  for (const rota of ["/painel", "/painel.html"]) {
    const b = blocos.find(x => x.padrao === rota);
    (b?.remover || []).includes("Content-Security-Policy")
      ? ok(`${rota} apaga o CSP do /* antes de pôr o dele`)
      : nao(`${rota} SEM "! Content-Security-Policy" — os dois CSP vão somar e bloquear`);
  }
  const curinga = blocos.find(x => x.padrao === "/*");
  curinga?.headers["Content-Security-Policy"]
    ? ok("e o /* continua com CSP para todo o resto") : nao("o /* ficou sem CSP");
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

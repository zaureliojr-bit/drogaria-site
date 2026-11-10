const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = (v, fb) => { try { return v ? JSON.parse(v) : fb; } catch { return fb; } };

const CSS = `
:root{--azul:#242490;--azul-esc:#161660;--verde:#18a957;--verde-esc:#0f8a45;--fundo:#f6f7fb;--texto:#1b1b2f;--suave:#5b5b78;--linha:#e3e4ee;--dest:#ffd23f}
*{box-sizing:border-box;margin:0}body{font:16px/1.5 Figtree,system-ui,sans-serif;color:var(--texto);background:var(--fundo);padding-bottom:calc(84px + env(safe-area-inset-bottom,0px))}
h1,h2,.preco,.marca{font-family:"Bricolage Grotesque",system-ui,sans-serif}a{color:inherit}
.wrap{max-width:720px;margin:0 auto;padding:0 18px}:focus-visible{outline:3px solid var(--dest);outline-offset:2px}
.topo{background:var(--azul);color:#fff;padding:calc(14px + env(safe-area-inset-top,0px)) 0 14px}.topo .wrap{display:flex;align-items:center;gap:12px}
.topo img{width:40px;height:40px;border-radius:10px;background:#fff;object-fit:contain}.marca{font-weight:800;font-size:17px;line-height:1.1}.marca small{display:block;font:400 13px Figtree,sans-serif;opacity:.85}
.hero{background:var(--azul);color:#fff;padding:8px 0 34px}.selo{display:inline-block;background:var(--dest);color:#2b2300;font-weight:600;font-size:14px;padding:5px 12px;border-radius:99px;margin-bottom:14px}
h1{font-weight:800;font-size:clamp(30px,8vw,44px);line-height:1.05;letter-spacing:-.02em;margin-bottom:12px}.hero p{font-size:18px;opacity:.92;max-width:46ch;margin-bottom:22px}
.btn{display:flex;align-items:center;justify-content:center;gap:10px;background:var(--verde);color:#fff;text-decoration:none;font-weight:600;font-size:18px;padding:16px 22px;border-radius:14px;width:100%;box-shadow:0 6px 18px rgba(24,169,87,.35)}.btn:hover{background:var(--verde-esc)}
.btn svg{width:24px;height:24px;fill:currentColor;flex:none}.sec{display:block;text-align:center;color:#fff;margin-top:14px;font-size:15px;opacity:.85}
@media(min-width:560px){.btn{width:auto;display:inline-flex}.sec{display:inline;margin-left:18px}}
.infos{margin-top:-18px}.infos .wrap{display:grid;gap:10px}.info{background:#fff;border:1px solid var(--linha);border-radius:14px;padding:14px 16px;display:flex;gap:12px}
.info b{display:block;font-size:15px}.info span{color:var(--suave);font-size:15px}.ico{font-size:22px;line-height:1.2}
@media(min-width:560px){.infos .wrap{grid-template-columns:repeat(3,1fr)}.info{flex-direction:column;gap:4px}}
section{padding:34px 0 6px}h2{font-size:26px;line-height:1.15;margin-bottom:6px}.sub{color:var(--suave);margin-bottom:16px}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}@media(min-width:560px){.grid{grid-template-columns:repeat(3,1fr)}}
.prod{background:#fff;border:1px solid var(--linha);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:6px}.prod .e{font-size:30px}.prod .nome{font-weight:600;font-size:15px;line-height:1.3;flex:1}
.prod .de{color:var(--suave);font-size:13px;text-decoration:line-through;min-height:19px}.preco{font-weight:800;font-size:24px;color:var(--azul)}
.prod a.pedir{margin-top:6px;text-align:center;text-decoration:none;color:var(--verde-esc);border:2px solid var(--verde);font-weight:600;padding:9px;border-radius:10px}.prod a.pedir:hover{background:var(--verde);color:#fff}
.passos{list-style:none;padding:0;display:grid;gap:10px;counter-reset:p}.passos li{counter-increment:p;background:#fff;border:1px solid var(--linha);border-radius:14px;padding:14px 16px 14px 56px;position:relative}
.passos li::before{content:counter(p);position:absolute;left:14px;top:12px;width:30px;height:30px;border-radius:50%;background:var(--azul);color:#fff;display:grid;place-items:center;font-weight:600}
.pag{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}.pag span{background:#fff;border:1px solid var(--linha);padding:6px 12px;border-radius:99px;font-size:14px}
.nota{background:#fff;border:1px solid var(--linha);border-radius:14px;padding:16px;display:flex;gap:14px;align-items:center;margin-top:14px}.nota .n{font:800 34px "Bricolage Grotesque",sans-serif;color:var(--azul)}
.aviso{font-size:13px;color:var(--suave);margin-top:14px}footer{margin-top:34px;background:var(--azul-esc);color:#d9d9f2;padding:26px 0;font-size:14px}footer p+p{margin-top:6px}
.fixo{position:fixed;left:0;right:0;bottom:0;z-index:20;background:rgba(255,255,255,.96);backdrop-filter:blur(8px);border-top:1px solid var(--linha);padding:10px 14px calc(10px + env(safe-area-inset-bottom,0px))}
.fixo .btn{width:100%;display:flex;max-width:720px;margin:0 auto;padding:14px}
`;

const ZAP_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.2 14.1c-.2.6-1.2 1.2-1.7 1.2-.4.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.7-1.2-4.4-3.9-4.5-4.1-.1-.2-1.1-1.4-1.1-2.7s.7-1.9.9-2.2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.1.1.3 0 .5l-.3.4-.4.5c-.1.1-.3.3-.1.6.2.3.7 1.2 1.5 1.9 1 .9 1.9 1.2 2.2 1.3.3.1.4.1.6-.1l.8-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.8-.1 1.5Z"/></svg>';

export function renderLanding(t) {
  const nome = esc(t.nome || t.bairro || 'sua região');
  const numero = String(t.whatsapp || '').replace(/\D/g, '');
  const digits = /^55\d{10,11}$/.test(numero) ? numero : /^\d{10,11}$/.test(numero) ? '55' + numero : '';
  const destino = new URL(t.catalogo);
  if (destino.protocol !== 'https:') throw new Error('O catálogo precisa usar HTTPS.');
  const loja = esc(destino.href);
  const logo = esc(destino.origin + '/logo.png');

  const zap = msg => digits
    ? `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
    : loja; // sem WhatsApp cadastrado, manda para a loja online
  const msgBase = `Olá! Vim pelo site da Drogaria Mais Barato (${t.nome || ''}) e quero fazer um pedido.`;
  const rotulo = digits ? 'Pedir pelo WhatsApp' : 'Abrir loja online';

  const pagamentos = json(t.formas_pagamento, []);
  const produtos = json(t.produtos_destaque, []).slice(0, 8);
  const legal = [t.responsavel && `Farmacêutico(a) responsável: ${t.responsavel}`, t.crf, t.cnpj && `CNPJ ${t.cnpj}`].filter(Boolean).map(esc).join(' · ');

  const info = (ico, titulo, valor) => valor
    ? `<div class="info"><span class="ico" aria-hidden="true">${ico}</span><div><b>${titulo}</b><span>${esc(valor)}</span></div></div>` : '';

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#242490">
<title>Drogaria Mais Barato ${nome} | Peça pelo WhatsApp</title>
<meta name="description" content="Drogaria Mais Barato em ${nome}: ofertas da semana, entrega na região e atendimento de farmacêutico. Peça pelo WhatsApp.">
<meta property="og:title" content="Drogaria Mais Barato | ${nome}"><meta property="og:image" content="${logo}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;800&family=Figtree:wght@400;600&display=swap" rel="stylesheet">
<style>${CSS}</style></head>
<body>
<header class="topo"><div class="wrap"><img src="${logo}" alt="" width="40" height="40"><div class="marca">Drogaria Mais Barato<small>Unidade ${nome}</small></div></div></header>
<main>
<div class="hero"><div class="wrap">
 <span class="selo">${esc(t.selo || 'Atendimento da unidade')}</span>
 <h1>${esc(t.titulo || 'Sua farmácia, a um toque')}</h1>
 <p>${esc(t.promessa || 'Consulte o catálogo e confira as opções de entrega ou retirada da unidade.')}</p>
 <a class="btn" data-wa="topo" href="${esc(zap(msgBase))}" target="_blank" rel="noopener">${digits ? ZAP_ICON : ''}${rotulo}</a>
 ${digits ? `<a class="sec" href="${loja}">Ver catálogo completo na loja online</a>` : ''}
</div></div>
<div class="infos"><div class="wrap">${info('🛵', 'Entrega', t.entrega)}${info('🕒', 'Horário', t.horario)}${info('📍', 'Endereço', t.endereco)}</div></div>
${produtos.length ? `<section><div class="wrap"><h2>Ofertas da semana em ${nome}</h2><p class="sub">Toque em “Pedir” e o produto já vai na mensagem.</p><div class="grid">
${produtos.map(p => `<div class="prod"><div class="e" aria-hidden="true">${esc(p.e || '')}</div><div class="nome">${esc(p.nome)}</div><div class="de">${esc(p.de || '')}</div><div class="preco">${esc(p.preco)}</div><a class="pedir" data-wa="produto:${esc(p.nome)}" href="${esc(zap(`Olá! Vim pelo anúncio e quero pedir: ${p.nome} (${p.preco}). Unidade ${t.nome || ''}.`))}" target="_blank" rel="noopener">Pedir</a></div>`).join('')}
</div></div></section>` : ''}
<section><div class="wrap"><h2>Como pedir</h2><ol class="passos">
 <li>Toque em <b>${rotulo}</b></li>
 <li>${digits ? "Informe o que precisa e consulte o atendimento da unidade." : "Escolha seus produtos no catálogo online."}</li>
 <li>Confirme o valor e a forma de pagamento. Pronto: entregamos ou você retira</li></ol></div></section>
<section><div class="wrap"><h2>Por que pedir aqui</h2><p class="sub">Atendimento de farmacêutico, preço justo e entrega na sua região.</p>
 ${pagamentos.length ? `<div class="pag">${pagamentos.map(p => `<span>${esc(p)}</span>`).join('')}</div>` : ''}
 ${t.google_nota ? `<div class="nota"><div class="n">${esc(t.google_nota)} ★</div><div><b>Avaliação no Google</b><br>${t.google_link ? `<a href="${esc(t.google_link)}" rel="noopener" style="color:var(--azul)">Ver avaliações dos clientes</a>` : ''}</div></div>` : ''}
 <p class="aviso">Medicamentos com tarja exigem receita. Leia a bula. Em caso de dúvida, consulte o farmacêutico.</p></div></section>
</main>
<footer><div class="wrap"><p><b>Drogaria Mais Barato</b> · Unidade ${nome}${t.endereco ? ' · ' + esc(t.endereco) : ''}</p>${legal ? `<p>${legal}</p>` : ''}</div></footer>
<div class="fixo"><a class="btn" data-wa="fixo" href="${esc(zap(msgBase))}" target="_blank" rel="noopener">${digits ? ZAP_ICON : ''}${rotulo}</a></div>
</body></html>`;
}


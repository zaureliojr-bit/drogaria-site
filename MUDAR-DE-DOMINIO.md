# Mudar o endereço da plataforma

Hoje a plataforma responde em `drogaria-site.pages.dev`. O destino é
`drogalink.com.br`. Este documento é a lista do que trocar — porque são
poucos lugares, mas esquecer **um** custa caro: o Google continua
indexando o endereço velho, e o trabalho de SEO fica dividido entre dois
domínios que disputam entre si.

> **Isto não é urgente, e não tem relação com o domínio das farmácias.**
> `maisbarato.drogalink.com.br` funciona com a plataforma ainda em
> `pages.dev` — o middleware olha o Host de quem chega, não o endereço da
> plataforma. Esta mudança é só sobre onde *a plataforma* mora.

## Antes de começar

O `drogalink.com.br` precisa estar **Active** na Cloudflare e adicionado
em Pages → drogaria-site → **Custom domains**, junto com o
`www.drogalink.com.br`. Enquanto isso não estiver de pé, trocar os
endereços no código aponta o Google para uma porta que não abre.

## O que trocar

Tudo é o literal `https://drogaria-site.pages.dev`:

| Arquivo | O que é |
|---|---|
| `public/index.html` | `canonical`, `og:url`, `og:image` e os dois blocos de dados estruturados |
| `public/oferta.html` | `canonical` |
| `public/robots.txt` | a linha `Sitemap:` |
| `public/sitemap-paginas.xml` | as três `<loc>` |
| `public/painel.html` | `SITE_URL` e o link "← Ver o site" |

O `sitemap-produtos.xml` **não** se edita à mão — são 6.800 linhas
geradas. Regere:

```
SITE=https://drogalink.com.br node scripts/gerar-sitemap.mjs
```

As páginas servidas por função (vitrine, página de produto, `/og/<ean>`)
**não** entram na lista: elas montam a canônica a partir do endereço de
quem pediu, e passam a dizer `drogalink.com.br` sozinhas no momento em
que o domínio responder.

## Depois de subir

1. **Search Console**: adicione a propriedade `drogalink.com.br`, envie o
   `sitemap.xml` novo e use a *Mudança de endereço* apontando do
   `pages.dev` para ela. É isso que transfere o histórico em vez de
   recomeçar do zero.
2. **O `pages.dev` continua respondendo**, e aí os dois endereços servem a
   mesma página. Como toda página passa a ser canônica do
   `drogalink.com.br`, o Google consolida lá e isso resolve o SEO — mas
   se incomodar, dá para o middleware redirecionar o `pages.dev` para o
   domínio novo. **Cuidado:** o painel mora no mesmo projeto, e um
   redirecionamento feito sem pensar nele derruba o acesso ao painel.
3. **O painel é caso à parte.** Movê-lo para `painel.drogalink.com.br`
   exige, antes, pôr a origem nova no `VITE_ORIGENS_PAINEL` do
   padronizador e reconstruí-lo — senão o quadro do padronizador para de
   carregar dentro do painel. Isso é trabalho no PC de casa.

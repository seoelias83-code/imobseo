# IMOBSEO

Gerador de landing page de imovel. Next.js (App Router), tudo **same-origin** na
Vercel: raspagem, publicacao e IA rodam no servidor do proprio projeto, sem CSP,
sem proxy externo, sem n8n.

## Como funciona

- `app/page.jsx` — a interface (hoje um shell de teste do pipeline; a UI aprovada
  do playground entra no lugar deste arquivo).
- `app/api/scrape` — `GET /api/scrape?url=` raspa o empreendimento server-side
  (cheerio). Mesmo contrato de campos do playground (`images`, `title`, `h2s`...).
- `app/api/save` — `POST /api/save {nome, html}` publica no Upstash Redis e devolve
  `{slug, url}`. So devolve o slug **depois de confirmar a gravacao** (sem URL fantasma).
- `app/api/ai` — `POST /api/ai {messages, system?, max_tokens?}` faz proxy pra
  Anthropic com a key do servidor. Tem fallback automatico de modelo (`MODELOS`).
  Retorna a resposta crua da Anthropic (o front le `data.content` igual antes).
- `app/imoveis/[slug]` — serve a LP **renderizada no servidor** (HTML pronto pro
  crawler, sem loader / document.write).

## Deploy na Vercel (5 passos)

1. Sobe esse repo num GitHub e importa o projeto na Vercel.
2. No projeto: **Storage → Marketplace → Upstash Redis → Connect**. A Vercel cria o
   banco e injeta as credenciais como env var sozinha (KV_REST_API_URL / _TOKEN).
   *(O Vercel KV foi descontinuado; Upstash Redis e o caminho atual.)*
3. **Settings → Environment Variables**: adiciona `ANTHROPIC_API_KEY` com a tua key.
   (Opcional: `AI_MODEL` pra forcar um modelo especifico.)
4. Redeploy (pra pegar as env vars).
5. Pronto: ferramenta em `/`, LPs publicadas em `/imoveis/<slug>`.

## Local

```
cp .env.example .env.local   # poe a ANTHROPIC_API_KEY e as credenciais do Upstash
npm install
npm run dev
```

## Trocar o shell pela UI do playground

A UI aprovada vira `app/page.jsx`. As unicas mudancas no JSX dela:
- `BACKEND` -> `""` (chamadas viram relativas: `/api/scrape`, `/api/save`).
- IA: trocar `https://api.anthropic.com/v1/messages` por `/api/ai`
  (e tirar o model do corpo, quem decide modelo agora e o `/api/ai`).

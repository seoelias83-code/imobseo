import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Backend real com key real => modelos atuais (nao e o motor de artefato).
// Regra do Josue: nunca um unico model string chumbado. Fallback automatico:
// se um modelo for aposentado/recusado, cai pro proximo sozinho.
const MODELOS = (process.env.AI_MODEL ? [process.env.AI_MODEL] : []).concat([
  "claude-sonnet-4-6",
  "claude-opus-4-8",
  "claude-haiku-4-5-20251001",
]);

export async function POST(req) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY ausente" }, { status: 500 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "json invalido" }, { status: 400 });
  }

  const { messages, system, max_tokens } = body || {};
  if (!messages) {
    return NextResponse.json({ error: "campo messages obrigatorio" }, { status: 400 });
  }

  let lastErr = null;
  for (const model of MODELOS) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: max_tokens || 1500,
          ...(system ? { system } : {}),
          messages,
        }),
      });

      const data = await r.json();
      if (r.ok) {
        // devolve a resposta crua da Anthropic: o front le data.content igual antes
        return NextResponse.json(data);
      }

      // erro de modelo (404/400 ou type/message citando "model") => tenta o proximo
      const type = (data && data.error && data.error.type) || "";
      const msg = (data && data.error && data.error.message) || "";
      lastErr = { status: r.status, ...data };
      const ehErroDeModelo =
        r.status === 404 || r.status === 400 || /model/i.test(type) || /model/i.test(msg);
      if (!ehErroDeModelo) {
        return NextResponse.json(data, { status: r.status });
      }
    } catch (e) {
      lastErr = { detail: String(e) };
    }
  }

  return NextResponse.json(
    { error: "todos os modelos falharam", last: lastErr },
    { status: 502 }
  );
}

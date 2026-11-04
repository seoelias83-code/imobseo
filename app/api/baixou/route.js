/**
 * Contador de downloads da planilha gratuita.
 *
 * POST /api/baixou  { codigo }  — soma 1 e devolve o total
 * GET  /api/baixou?codigo=XXXXXX — só lê, pra você conferir sem contar
 *
 * Serve pra você saber se o QR virou interesse de verdade: quantas vezes
 * aquele cliente baixou os 100 títulos antes de decidir.
 */
import { getRedis } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sem = { "Cache-Control": "no-store" };

const limpar = (v) => String(v || "").trim().toUpperCase().slice(0, 12);

export async function POST(req) {
  let codigo = "";
  try {
    codigo = limpar((await req.json())?.codigo);
  } catch {
    /* corpo vazio: cai no erro abaixo */
  }
  if (!codigo) return Response.json({ erro: "sem código" }, { status: 400 });

  const n = await getRedis().incr(`baixou:${codigo}`);
  return Response.json({ ok: true, n }, { headers: sem });
}

export async function GET(req) {
  const codigo = limpar(new URL(req.url).searchParams.get("codigo"));
  if (!codigo) return Response.json({ erro: "sem código" }, { status: 400 });

  const n = Number(await getRedis().get(`baixou:${codigo}`)) || 0;
  return Response.json({ codigo, baixou: n }, { headers: sem });
}

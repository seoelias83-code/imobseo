/**
 * POST /api/ip-interno  { chave }
 *
 * O CRM chama ao abrir e a cada 30 minutos, do seu computador. O IP dessa
 * chamada fica marcado por 30 dias: página aberta desse IP não liga o
 * cronômetro do cliente e download não conta.
 */
import { ipDe, marcarIpInterno } from "@/lib/oferta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMBUTIDA = "h1sitemap-publica-K7qx2026";
const CHAVES = [process.env.PUBLICAR_KEY, EMBUTIDA].filter(Boolean);

export async function POST(req) {
  let d = {};
  try {
    d = await req.json();
  } catch {
    /* corpo inválido: cai na checagem da chave */
  }
  if (!CHAVES.includes(String(d.chave || "").trim()))
    return Response.json({ erro: "chave inválida" }, { status: 401 });
  const ip = ipDe(req);
  if (!ip) return Response.json({ erro: "sem IP" }, { status: 400 });
  await marcarIpInterno(ip);
  return Response.json({ ok: true, ip }, { headers: { "Cache-Control": "no-store" } });
}

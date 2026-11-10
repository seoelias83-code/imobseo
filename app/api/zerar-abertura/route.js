/**
 * POST /api/zerar-abertura  { chave, codigos: ["22GDL6", ...] }
 *
 * O CRM chama ao abrir, com os códigos das imobiliárias que ainda não receberam
 * a mensagem. Se alguma página foi aberta antes do envio (visita sua, teste),
 * o cronômetro volta a zero e só começa no primeiro acesso do cliente.
 * Quem já pagou não é mexido.
 */
import { getRedis } from "@/lib/redis";
import { lerPedido } from "@/lib/oferta";

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

  const codigos = (Array.isArray(d.codigos) ? d.codigos : [])
    .map((c) => String(c || "").trim().toUpperCase().slice(0, 12))
    .filter(Boolean)
    .slice(0, 500);

  const redis = getRedis();
  let zerados = 0;
  for (const codigo of codigos) {
    const pedido = await lerPedido(codigo);
    if (pedido?.status === "pago") continue;
    zerados += Number(await redis.del(`abertura:${codigo}`)) || 0;
  }
  return Response.json({ ok: true, zerados }, { headers: { "Cache-Control": "no-store" } });
}

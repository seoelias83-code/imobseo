/**
 * GET /api/status?codigo=ABC123
 * A página consulta isso enquanto o Pix está aberto.
 *
 * Normalmente quem marca como pago é o webhook. Mas se o webhook falhar ou
 * demorar, aqui também perguntamos ao MP — assim a tela do cliente vira do
 * mesmo jeito, sem depender de um aviso que pode não chegar.
 */
import { lerPedido, lerOrdem, estaPago, liberar } from "@/lib/oferta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const codigo = String(
    new URL(req.url).searchParams.get("codigo") || ""
  ).trim().toUpperCase();

  if (!codigo) return Response.json({ erro: "sem código" }, { status: 400 });

  const sem = { "Cache-Control": "no-store" };
  const pedido = await lerPedido(codigo);

  if (!pedido) return Response.json({ status: "novo" }, { headers: sem });

  if (pedido.status === "pago")
    return Response.json(
      { status: "pago", planilha: pedido.planilha || "", erro: pedido.erroPlanilha || "" },
      { headers: sem }
    );

  if (pedido.orderId) {
    try {
      const ordem = await lerOrdem(pedido.orderId);
      if (estaPago(ordem)) {
        const novo = await liberar(codigo);
        return Response.json(
          { status: "pago", planilha: novo.planilha || "", erro: novo.erroPlanilha || "" },
          { headers: sem }
        );
      }
    } catch (e) {
      console.error("status:", e);
    }
  }

  return Response.json({ status: pedido.status || "aguardando" }, { headers: sem });
}

/**
 * POST /api/mp-webhook — o Mercado Pago avisa aqui quando algo muda.
 *
 * O aviso traz só um id, e qualquer um pode forjar esse POST. Por isso a
 * confirmação não vem do corpo recebido: lemos a ordem direto na API do MP
 * e só liberamos se ela estiver paga de verdade.
 *
 * Responde 200 sempre que entendeu o aviso, mesmo sem ter o que fazer —
 * o MP reenvia o que não voltar 200, e não queremos fila de reenvio à toa.
 */
import { lerOrdem, estaPago, liberar } from "@/lib/oferta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ok = (o = { ok: true }) => Response.json(o, { status: 200 });

export async function POST(req) {
  let aviso;
  try {
    aviso = await req.json();
  } catch {
    return ok({ ignorado: "corpo ilegível" });
  }

  const id =
    aviso?.data?.id ||
    aviso?.resource?.toString().split("/").pop() ||
    aviso?.id;
  if (!id) return ok({ ignorado: "sem id" });

  try {
    const ordem = await lerOrdem(id);
    const codigo = String(ordem?.external_reference || "").toUpperCase();
    if (!codigo) return ok({ ignorado: "ordem sem código" });

    if (!estaPago(ordem))
      return ok({ codigo, status: ordem?.status || "pendente" });

    const pedido = await liberar(codigo);
    console.log("pago:", codigo, pedido.planilha ? "planilha ok" : pedido.erroPlanilha);
    return ok({ codigo, status: "pago" });
  } catch (e) {
    console.error("webhook:", e);
    // 500 faz o MP tentar de novo, que é o que queremos numa falha nossa.
    return Response.json({ erro: String(e.message || e) }, { status: 500 });
  }
}

// O MP às vezes valida o endereço com um GET antes de usar.
export const GET = () => ok({ ok: true });

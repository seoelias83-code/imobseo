/**
 * POST /api/mp-webhook — o Mercado Pago avisa aqui quando algo muda.
 *
 * O aviso traz so um id, e qualquer um pode forjar esse POST. Por isso a
 * confirmacao nao vem do corpo recebido: lemos a cobranca direto na API do
 * MP e so liberamos se ela estiver paga de verdade.
 *
 * Qual id vem depende do evento configurado no painel — "Order" manda o id
 * da ordem, "Pagamentos (legacy)" manda o id do pagamento. O resolver tenta
 * os dois, entao a escolha la nao quebra isso aqui.
 *
 * Responde 200 sempre que entendeu o aviso, mesmo sem ter o que fazer. 500
 * so em falha nossa, porque e ele que faz o MP reenviar: devolver 500 num
 * aviso que nunca vai dar certo cria um looping de reenvio.
 */
import { resolverAviso, liberar } from "@/lib/oferta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ok = (o = { ok: true }) => Response.json(o, { status: 200 });

export async function POST(req) {
  let aviso;
  try {
    aviso = await req.json();
  } catch {
    return ok({ ignorado: "corpo ilegivel" });
  }

  const id =
    aviso?.data?.id ||
    aviso?.resource?.toString().split("/").pop() ||
    aviso?.id;
  if (!id) return ok({ ignorado: "sem id" });

  try {
    const cobranca = await resolverAviso(id);
    if (!cobranca) return ok({ ignorado: "id desconhecido", id });

    const { codigo, pago, onde } = cobranca;
    if (!pago) return ok({ codigo, status: "pendente", onde });

    const pedido = await liberar(codigo);
    console.log("pago:", codigo, pedido.planilha ? "planilha ok" : pedido.erroPlanilha);
    return ok({ codigo, status: "pago" });
  } catch (e) {
    console.error("webhook:", e);
    // 500 faz o MP tentar de novo, que e o que queremos numa falha nossa.
    return Response.json({ erro: String(e.message || e) }, { status: 500 });
  }
}

// O MP as vezes valida o endereco com um GET antes de usar.
export const GET = () => ok({ ok: true });

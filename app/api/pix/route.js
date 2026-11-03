/**
 * POST /api/pix  { codigo, email }
 * Cria a cobrança Pix e devolve o copia-e-cola e a imagem do QR.
 */
import {
  lerOferta,
  lerPedido,
  gravarPedido,
  primeiraAbertura,
  prazo,
  criarPix,
  PRECO,
  PRECO_DEPOIS,
} from "@/lib/oferta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const erro = (msg, status = 400) =>
  Response.json({ erro: msg }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req) {
  let corpo;
  try {
    corpo = await req.json();
  } catch {
    return erro("Corpo inválido");
  }

  const codigo = String(corpo.codigo || "").trim().toUpperCase();
  const email = String(corpo.email || "").trim().toLowerCase();

  if (!codigo) return erro("Código não informado");
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email))
    return erro("Confira o e-mail. Ele recebe o link da planilha.");

  const oferta = await lerOferta(codigo);
  if (!oferta) return erro("Código não encontrado", 404);

  // Já pago: devolve o link em vez de cobrar de novo.
  const pedido = await lerPedido(codigo);
  if (pedido?.status === "pago")
    return Response.json({ status: "pago", planilha: pedido.planilha || "" });

  // O preço segue o relógio: acabou o prazo, vale o cheio.
  const abertura = await primeiraAbertura(codigo);
  const expirou = Date.now() > new Date(prazo(abertura)).getTime();
  const valor = expirou ? PRECO_DEPOIS : PRECO;

  try {
    const pix = await criarPix({
      codigo,
      email,
      valor,
      descricao: `1.000 títulos — ${oferta.dominio || codigo}`,
    });

    await gravarPedido(codigo, {
      ...(pedido || {}),
      orderId: pix.orderId,
      email,
      valor,
      status: "aguardando",
      criadoEm: new Date().toISOString(),
    });

    return Response.json(
      {
        status: "aguardando",
        valor,
        copiaECola: pix.copiaECola,
        qrBase64: pix.qrBase64,
        ticketUrl: pix.ticketUrl,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("pix:", e);
    return erro("Não consegui gerar o Pix agora. Tenta de novo em instantes.", 502);
  }
}

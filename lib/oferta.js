/**
 * lib/oferta.js — estado da oferta, Mercado Pago e planilha.
 *
 * Usa o mesmo Redis do resto do projeto (lib/redis.js).
 *
 * Chaves:
 *   oferta:{codigo}    dados da imobiliaria e os titulos
 *   abertura:{codigo}  ISO da primeira vez que a pagina abriu (manda no relogio)
 *   pedido:{codigo}    { orderId, email, status, planilha }
 */
import { getRedis } from "@/lib/redis";

const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
const SCRIPT_URL = process.env.APPS_SCRIPT_URL || "";
const SCRIPT_KEY = process.env.APPS_SCRIPT_KEY || "";

export const HORAS_OFERTA = Number(process.env.HORAS_OFERTA || 24);
export const PRECO = process.env.PRECO_AGORA || "9.99";
export const PRECO_DEPOIS = process.env.PRECO_DEPOIS || "298.00";

/* ------------------------------------------------------------------ redis */

/** Dados da imobiliaria. Gravados pelo scripts/importar.mjs. */
export const lerOferta = (codigo) => getRedis().get(`oferta:${codigo}`);

export const gravarOferta = (codigo, dados) =>
  getRedis().set(`oferta:${codigo}`, dados);

/**
 * Marca a primeira abertura e devolve ela.
 * nx: so grava se ainda nao existir, entao reabrir nao reinicia o relogio.
 */
export async function primeiraAbertura(codigo) {
  const redis = getRedis();
  const agora = new Date().toISOString();
  await redis.set(`abertura:${codigo}`, agora, { nx: true });
  return (await redis.get(`abertura:${codigo}`)) || agora;
}

export const prazo = (abertura) =>
  new Date(new Date(abertura).getTime() + HORAS_OFERTA * 3600_000).toISOString();

export const lerPedido = (codigo) => getRedis().get(`pedido:${codigo}`);
export const gravarPedido = (codigo, p) => getRedis().set(`pedido:${codigo}`, p);

/* --------------------------------------------------------- mercado pago */

/**
 * Cria a ordem Pix. Devolve o copia-e-cola e a imagem do QR.
 * So o e-mail do pagador e obrigatorio — CPF nao entra.
 */
export async function criarPix({ codigo, email, valor, descricao }) {
  if (!MP_TOKEN)
    throw new Error("MP_ACCESS_TOKEN ausente. Configure a variavel na Vercel.");

  const r = await fetch("https://api.mercadopago.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MP_TOKEN}`,
      "Content-Type": "application/json",
      accept: "application/json",
      // unica por tentativa: evita cobrar duas vezes se a rede repetir o POST
      "X-Idempotency-Key": `${codigo}-${Date.now()}`,
    },
    body: JSON.stringify({
      type: "online",
      processing_mode: "automatic",
      total_amount: valor,
      external_reference: codigo,
      description: descricao,
      transactions: {
        payments: [
          {
            amount: valor,
            expiration_time: "PT30M",
            payment_method: { id: "pix", type: "bank_transfer" },
          },
        ],
      },
      payer: { email },
    }),
    cache: "no-store",
  });

  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corpo?.message || corpo?.error || `MP ${r.status}`);

  const pm = corpo?.transactions?.payments?.[0]?.payment_method || {};
  return {
    orderId: corpo.id,
    copiaECola: pm.qr_code || "",
    qrBase64: pm.qr_code_base64 || "",
    ticketUrl: pm.ticket_url || "",
  };
}

/**
 * Le a ordem na fonte. O webhook do MP so traz o id, e qualquer um pode
 * forjar um POST — entao a confirmacao sai daqui, nao do corpo recebido.
 */
export async function lerOrdem(orderId) {
  const r = await fetch(`https://api.mercadopago.com/v1/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${MP_TOKEN}`, accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`MP ${r.status} ao ler a ordem`);
  return r.json();
}

/** O MP usa nomes diferentes conforme o fluxo; estes sao os de ordem paga. */
export const estaPago = (ordem) => {
  const s = String(ordem?.status || "").toLowerCase();
  const p = String(ordem?.transactions?.payments?.[0]?.status || "").toLowerCase();
  return ["processed", "paid", "approved", "accredited"].some(
    (ok) => s === ok || p === ok
  );
};

/* ----------------------------------------------------------- planilha */

/**
 * Pede ao Apps Script a planilha com os titulos e devolve o link.
 * E o mesmo endpoint que o app H1 do Sitemap ja usa.
 */
export async function criarPlanilha({ codigo, dominio, linhas }) {
  if (!SCRIPT_URL) return "";
  const r = await fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ chave: SCRIPT_KEY, codigo, dominio, titulos: linhas }),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Apps Script ${r.status}`);
  const corpo = await r.json().catch(() => ({}));
  const url = corpo.url || corpo.planilha || corpo.link || "";
  if (!url) throw new Error(corpo.error || "Apps Script nao devolveu o link");
  return url;
}

/**
 * Pagamento confirmado: cria a planilha e guarda o link.
 * Idempotente — se ja existe planilha, devolve a mesma.
 */
export async function liberar(codigo) {
  const pedido = (await lerPedido(codigo)) || {};
  if (pedido.planilha) return pedido;

  const oferta = await lerOferta(codigo);
  let planilha = "";
  let erro = "";
  try {
    planilha = await criarPlanilha({
      codigo,
      dominio: oferta?.dominio || "",
      linhas: oferta?.titulos || [],
    });
  } catch (e) {
    erro = String(e.message || e);
  }

  const novo = {
    ...pedido,
    status: "pago",
    planilha,
    erroPlanilha: erro,
    pagoEm: new Date().toISOString(),
  };
  await gravarPedido(codigo, novo);
  return novo;
}

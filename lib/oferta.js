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
export const PRECO = process.env.PRECO_AGORA || "19.80";
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

/* ------------------------------------------------- IP do dono (não conta) */

/** IP de quem fez a requisição, pela Vercel. */
export const ipDe = (req) =>
  String(req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "")
    .split(",")[0]
    .trim();

/** O CRM avisa o IP do seu computador; acesso dele não liga cronômetro nem conta download. */
export const marcarIpInterno = (ip) =>
  getRedis().set(`ip_interno:${ip}`, new Date().toISOString(), { ex: 60 * 60 * 24 * 30 });

export const ehIpInterno = async (ip) => Boolean(ip && (await getRedis().get(`ip_interno:${ip}`)));

/** Só lê: a visita interna (sua) não grava a primeira abertura. */
export const lerAbertura = (codigo) => getRedis().get(`abertura:${codigo}`);

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

/**
 * O aviso do webhook traz um id, mas qual id depende do evento configurado:
 * "Order" manda o id da ordem, "Pagamentos (legacy)" manda o id do pagamento.
 * Sao numeros diferentes. Tentamos os dois e devolvemos o codigo e se pagou,
 * ou null quando o id nao e de nenhum dos dois (aviso de outra conta, teste
 * do painel, id forjado).
 */
export async function resolverAviso(id) {
  const recusas = [];
  for (const rota of ["orders", "payments"]) {
    const r = await fetch(`https://api.mercadopago.com/v1/${rota}/${id}`, {
      headers: { Authorization: `Bearer ${MP_TOKEN}`, accept: "application/json" },
      cache: "no-store",
    });

    // 404 = nao e desse tipo. 401/403 = nao e nosso, ou o token esta errado.
    // Nos tres casos insistir nao resolve, entao seguimos e no fim
    // devolvemos null — o webhook responde 200 e o MP para de reenviar.
    if ([401, 403, 404].includes(r.status)) {
      recusas.push(`${rota} ${r.status}`);
      continue;
    }
    if (!r.ok) throw new Error(`MP ${r.status} em /${rota}`);

    const d = await r.json();
    const codigo = String(d?.external_reference || "").toUpperCase();
    if (!codigo) {
      recusas.push(`${rota} sem external_reference`);
      continue;
    }
    return { codigo, pago: estaPago(d), onde: rota };
  }
  // 401/403 nas duas quase sempre e token errado: fica no log pra voce ver.
  console.warn("webhook: id", id, "nao resolvido —", recusas.join(", "));
  return null;
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
export async function criarPlanilha({ dominio, linhas }) {
  if (!SCRIPT_URL) return "";

  const nf = (n) => Number(n || 0).toLocaleString("pt-BR");
  const kw = (ts) =>
    (ts || []).map(([t, v]) => `${t} · ${nf(v)}`).join("\n");
  const soma = (ts) => (ts || []).reduce((s, [, v]) => s + Number(v || 0), 0);
  const hoje = new Date().toLocaleDateString("pt-BR");

  const corpo = {
    chave: SCRIPT_KEY,
    nome: `${dominio} · ${linhas.length} títulos otimizados · ${hoje}`,
    aba: `${linhas.length} otimizações`,
    titulo: `${linhas.length} títulos otimizados em ${dominio}`,
    subtitulo:
      "Palavras ativas: buscas do Google que aparecem exatas no título. " +
      "Cole o título otimizado no campo de título da página do imóvel.",
    contato: "",
    cabecalho: [
      "#", "Página", "Título atual", "Palavras ativas (atual)",
      "Título otimizado", "Palavras ativas (otimizado)",
      "Buscas/mês atual", "Buscas/mês otimizado",
    ],
    linhas: linhas.map((t, i) => [
      i + 1, t.url || "", t.antes || "",
      kw(t.antesKw) || "nenhuma", t.depois || "", kw(t.depoisKw),
      soma(t.antesKw), soma(t.depoisKw),
    ]),
    numericas: [6, 7],
    destaque: [4],
    quebra: [2, 3, 4, 5],
    larguras: [40, 220, 320, 220, 320, 240, 120, 140],
  };

  const r = await fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Apps Script ${r.status}`);

  const bruto = await r.text();
  let j;
  try {
    j = JSON.parse(bruto);
  } catch {
    throw new Error(
      bruto.toLowerCase().includes("<html")
        ? "o Apps Script devolveu uma pagina. Confira se a implantacao esta como 'Qualquer pessoa' e se o link termina em /exec"
        : "resposta estranha do Apps Script"
    );
  }
  if (j.erro) throw new Error(j.erro);
  if (!j.url) throw new Error("o Apps Script nao devolveu o link");
  return j.url;
}

/**
 * Pagamento confirmado: cria a planilha e guarda o link.
 * Idempotente — se ja existe planilha, devolve a mesma.
 */
export async function liberar(codigo) {
  const pedido = (await lerPedido(codigo)) || {};
  if (pedido.planilha) return pedido;

  const oferta = await lerOferta(codigo);

  // Leitura curta (só o necessário pros 100 grátis): o pagamento fica marcado e a
  // planilha sai quando o app publicar a leitura completa (POST /api/publicar).
  if (oferta && oferta.completo === false) {
    const espera = {
      ...pedido,
      status: "pago",
      planilha: "",
      aguardandoLeitura: true,
      pagoEm: pedido.pagoEm || new Date().toISOString(),
    };
    await gravarPedido(codigo, espera);
    return espera;
  }
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
    aguardandoLeitura: false,
    pagoEm: pedido.pagoEm || new Date().toISOString(),
  };
  await gravarPedido(codigo, novo);
  return novo;
}

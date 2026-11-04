/**
 * POST /api/publicar — o app H1 do Sitemap publica a pagina de oferta daqui.
 *
 * Recebe os titulos ja reescritos, grava no Redis e devolve o endereco da
 * pagina. E isso que vai no QR code do PDF.
 *
 * O codigo sai do dominio, sempre o mesmo: gerar o PDF de novo aponta pra
 * mesma pagina, entao o relogio de quem ja abriu nao reinicia.
 *
 * Protegido por PUBLICAR_KEY. Sem ela ninguem publica oferta no seu dominio.
 */
import { createHash } from "node:crypto";
import { gravarOferta, lerOferta } from "@/lib/oferta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHAVE = process.env.PUBLICAR_KEY || "";

// sem vogais: nao forma palavra sem querer, e nao tem 0/O nem 1/I pra confundir
const ALFABETO = "23456789BCDFGHJKLMNPQRSTVWXZ";

function codigoDe(dominio) {
  const h = createHash("sha256").update(dominio.toLowerCase()).digest();
  let s = "";
  for (let i = 0; i < 6; i++) s += ALFABETO[h[i] % ALFABETO.length];
  return s;
}

const texto = (v) => String(v ?? "").trim();
const numero = (v) => Number(String(v ?? "").replace(/[^\d-]/g, "")) || 0;

/** [["casa para alugar", 49500], ...] — aceita o que o app manda e limpa. */
function palavras(v) {
  if (!Array.isArray(v)) return [];
  return v
    .map((p) => (Array.isArray(p) ? [texto(p[0]), numero(p[1])] : null))
    .filter((p) => p && p[0]);
}

export async function POST(req) {
  if (!CHAVE)
    return Response.json({ erro: "PUBLICAR_KEY nao configurada no servidor" }, { status: 503 });

  let d;
  try {
    d = await req.json();
  } catch {
    return Response.json({ erro: "corpo invalido" }, { status: 400 });
  }

  if (texto(d.chave) !== CHAVE)
    return Response.json({ erro: "chave errada" }, { status: 401 });

  const dominio = texto(d.dominio).replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  if (!dominio) return Response.json({ erro: "dominio nao informado" }, { status: 400 });

  const titulos = (Array.isArray(d.titulos) ? d.titulos : [])
    .map((t) => ({
      url: texto(t.url),
      antes: texto(t.antes),
      antesKw: palavras(t.antesKw),
      depois: texto(t.depois),
      depoisKw: palavras(t.depoisKw),
    }))
    .filter((t) => t.depois);

  if (!titulos.length)
    return Response.json({ erro: "nenhum titulo recebido" }, { status: 400 });

  const codigo = texto(d.codigo).toUpperCase() || codigoDe(dominio);

  // Republicar o mesmo dominio atualiza os titulos e preserva o que ja foi
  // combinado antes (quantidade do brinde, nome digitado na mao).
  const antiga = (await lerOferta(codigo)) || {};

  await gravarOferta(codigo, {
    ...antiga,
    dominio,
    imobiliaria: texto(d.imobiliaria) || antiga.imobiliaria || dominio,
    cidade: texto(d.cidade) || antiga.cidade || "",
    paginas: numero(d.paginas) || antiga.paginas || 0,
    analisadas: numero(d.analisadas) || antiga.analisadas || 0,
    ganho: numero(d.ganho) || antiga.ganho || 0,
    gratis: numero(d.gratis) || antiga.gratis || 100,
    pacote: numero(d.pacote) || antiga.pacote || 1000,
    whatsapp: texto(d.whatsapp) || antiga.whatsapp || "",
    revendedor: texto(d.revendedor) || antiga.revendedor || "",
    titulos,
    publicadoEm: new Date().toISOString(),
  });

  const base = (process.env.BASE_URL || `https://${req.headers.get("host")}`).replace(/\/$/, "");
  return Response.json({ ok: true, codigo, url: `${base}/seo-geo/${codigo}`, titulos: titulos.length });
}

export const GET = () => Response.json({ ok: true, rota: "publicar" });

/**
 * GET /seo-geo/{codigo} — a página da oferta.
 *
 * Devolve o HTML pronto, com os dados da imobiliária injetados. A primeira
 * abertura é gravada aqui: é ela que define o prazo, e reabrir não reinicia.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  lerOferta,
  lerPedido,
  primeiraAbertura,
  prazo,
  PRECO,
  PRECO_DEPOIS,
} from "@/lib/oferta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const html = (corpo, status = 200) =>
  new Response(corpo, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });

const semCodigo = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Página não encontrada</title>
<style>body{font:16px/1.6 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;
background:#F1F3EF;color:#16211C;padding:24px;text-align:center}p{max-width:34ch;color:#5A6B62}</style>
</head><body><div><h1 style="font-weight:500;font-size:22px;margin:0 0 8px">Código não encontrado</h1>
<p>Confira o endereço do QR code. Se o papel estiver certo, chame no WhatsApp que a gente reabre.</p>
</div></body></html>`;

const reais = (n) => Number(n).toFixed(2).replace(".", ",");

export async function GET(_req, { params }) {
  const { codigo: bruto } = await params;
  const codigo = String(bruto || "").trim().toUpperCase();

  const oferta = await lerOferta(codigo);
  if (!oferta) return html(semCodigo, 404);

  const abertura = await primeiraAbertura(codigo);
  const pedido = await lerPedido(codigo);

  const dados = {
    demo: false,
    codigo,
    imobiliaria: oferta.imobiliaria || oferta.dominio || "",
    cidade: oferta.cidade || "",
    paginas: Number(oferta.paginas || 0),
    analisadas: Number(oferta.analisadas || 0),
    gratis: Number(oferta.gratis || 100),
    pacote: Number(oferta.pacote || 1000),
    ganho: Number(oferta.ganho || 0),
    precoAgora: reais(PRECO),
    precoDepois: reais(PRECO_DEPOIS),
    deadline: prazo(abertura),
    // o brinde: os titulos que a pagina entrega de graca. Vem da lista
    // completa, cortada no tamanho do brinde combinado (100 por padrao).
    brinde: (Array.isArray(oferta.titulos) && oferta.titulos.length
      ? oferta.titulos
      : oferta.exemplos || []
    ).slice(0, Number(oferta.gratis || 100)),
    jaPago: pedido?.status === "pago",
    planilha: pedido?.planilha || "",
    whatsapp: oferta.whatsapp || process.env.WHATSAPP || "",
    dominio: oferta.dominio || "",
  };

  const molde = await readFile(
    path.join(process.cwd(), "data", "pagina.html"),
    "utf-8"
  );

  // </script> dentro do JSON fecharia a tag do navegador antes da hora.
  const json = JSON.stringify(dados).replace(/<\//g, "<\\/");
  return html(molde.replace("__DADOS__", json));
}

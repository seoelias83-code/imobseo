import * as cheerio from "cheerio";

// Raspagem server-side (sem CSP). Mantem o mesmo contrato de campos
// que o playground ja consome: { url, title, meta, ogTitle, ogDesc,
// h1, h2s, images, texts, addressHints, https, mobile }.
export async function scrape(rawUrl) {
  let url = (rawUrl || "").trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ImobSeoBot/1.0)" },
    redirect: "follow",
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  const txt = (el) => $(el).text().replace(/\s+/g, " ").trim();

  const title = (txt($("title").first()) || "").trim();
  const meta = ($('meta[name="description"]').attr("content") || "").trim();
  const ogTitle = ($('meta[property="og:title"]').attr("content") || "").trim();
  const ogDesc = ($('meta[property="og:description"]').attr("content") || "").trim();
  const h1 = (txt($("h1").first()) || "").trim();
  const h2s = $("h2").map((_, el) => txt(el)).get().filter(Boolean).slice(0, 30);

  // imagens: src + lazy (data-src / data-lazy-src), absolutas, sem data:
  const seen = new Set();
  const images = [];
  $("img").each((_, el) => {
    const cand =
      $(el).attr("src") ||
      $(el).attr("data-src") ||
      $(el).attr("data-lazy-src") ||
      "";
    if (!cand) return;
    let abs;
    try {
      abs = new URL(cand, url).href;
    } catch {
      return;
    }
    if (abs.startsWith("data:")) return;
    if (seen.has(abs)) return;
    seen.add(abs);
    images.push(abs);
  });

  // paragrafos com algum corpo
  const texts = $("p")
    .map((_, el) => txt(el))
    .get()
    .filter((t) => t.length > 40)
    .slice(0, 40);

  // dicas de endereco ancoradas em prefixo de logradouro + maiuscula
  // (corrige o bug antigo de casar "pe" no meio de qualquer string)
  const bodyText = $("body").text();
  const addrRegex =
    /\b(Rua|Avenida|Av\.|Alameda|Travessa|Estrada|Rodovia)\s+[A-ZÀ-Ú][\wÀ-ú\s,.\-º°]{3,60}/g;
  const addressHints = [];
  let m;
  while ((m = addrRegex.exec(bodyText)) && addressHints.length < 5) {
    addressHints.push(m[0].replace(/\s+/g, " ").trim());
  }

  return {
    url,
    title,
    meta,
    ogTitle,
    ogDesc,
    h1,
    h2s,
    images,
    texts,
    addressHints,
    https: url.startsWith("https://"),
    mobile: !!$('meta[name="viewport"]').attr("content"),
  };
}

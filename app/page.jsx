"use client";

import { useState } from "react";

// Same-origin: chama as proprias rotas do projeto. Sem BACKEND externo, sem CSP.
export default function Home() {
  const [url, setUrl] = useState("");
  const [scrapeRes, setScrapeRes] = useState(null);
  const [saveRes, setSaveRes] = useState(null);
  const [aiRes, setAiRes] = useState(null);
  const [busy, setBusy] = useState("");

  async function testScrape() {
    setBusy("scrape");
    setScrapeRes(null);
    try {
      const r = await fetch("/api/scrape?url=" + encodeURIComponent(url || "https://example.com"));
      const d = await r.json();
      setScrapeRes({
        ok: r.ok,
        msg: r.ok
          ? `OK — title: "${(d.title || "").slice(0, 50)}" | imgs: ${(d.images || []).length} | h2s: ${(d.h2s || []).length}`
          : `ERRO ${r.status}: ${d.error || ""}`,
      });
    } catch (e) {
      setScrapeRes({ ok: false, msg: "FALHOU: " + e.message });
    }
    setBusy("");
  }

  async function testSave() {
    setBusy("save");
    setSaveRes(null);
    try {
      const r = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: "Teste Pipeline",
          html: "<h1 style='font-family:sans-serif'>LP de teste publicada same-origin</h1><p>Se voce ta lendo isso renderizado, o save + SSR funcionam.</p>",
        }),
      });
      const d = await r.json();
      setSaveRes({
        ok: r.ok && !!d.slug,
        slug: d.slug,
        msg: d.slug ? `OK — publicada em ${d.url}` : `ERRO ${r.status}: ${d.error || ""}`,
      });
    } catch (e) {
      setSaveRes({ ok: false, msg: "FALHOU: " + e.message });
    }
    setBusy("");
  }

  async function testAI() {
    setBusy("ai");
    setAiRes(null);
    try {
      const r = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_tokens: 80,
          messages: [{ role: "user", content: "Responda apenas com a frase: pipeline de IA ok." }],
        }),
      });
      const d = await r.json();
      const texto = (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join(" ");
      setAiRes({
        ok: r.ok && !!texto,
        msg: texto ? `OK — "${texto.trim()}"` : `ERRO ${r.status}: ${d.error || JSON.stringify(d).slice(0, 120)}`,
      });
    } catch (e) {
      setAiRes({ ok: false, msg: "FALHOU: " + e.message });
    }
    setBusy("");
  }

  const Card = ({ titulo, res }) => (
    <div
      style={{
        border: `1px solid ${res ? (res.ok ? "#39ff88" : "#ff4d6d") : "#2a2a2a"}`,
        background: res ? (res.ok ? "#0c1f14" : "#1f0c10") : "#111",
        borderRadius: 8,
        padding: "12px 14px",
        marginTop: 10,
        fontFamily: "var(--font-dm-mono), monospace",
        fontSize: 13,
        color: "#ccc",
        wordBreak: "break-word",
      }}
    >
      <strong style={{ color: "#fff" }}>{titulo}</strong>
      <div style={{ marginTop: 4 }}>{res ? res.msg : "—"}</div>
      {res && res.slug && (
        <a href={res.url || "/imoveis/" + res.slug} target="_blank" rel="noreferrer">
          abrir LP →
        </a>
      )}
    </div>
  );

  const btn = (label, onClick, key) => (
    <button
      onClick={onClick}
      disabled={!!busy}
      style={{
        background: busy === key ? "#333" : "#39ff88",
        color: busy === key ? "#888" : "#000",
        border: "none",
        borderRadius: 8,
        padding: "9px 16px",
        fontWeight: 700,
        fontFamily: "var(--font-syne), sans-serif",
        cursor: busy ? "default" : "pointer",
      }}
    >
      {busy === key ? "..." : label}
    </button>
  );

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px" }}>
      <h1 style={{ fontFamily: "var(--font-syne), sans-serif", marginBottom: 4 }}>
        IMOBSEO · shell de teste
      </h1>
      <p style={{ color: "#888", fontSize: 14, marginTop: 0 }}>
        Painel temporario só pra validar o pipeline same-origin (raspagem, publicacao, IA).
        A UI aprovada do playground entra no lugar deste arquivo.
      </p>

      <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="url de um empreendimento pra testar a raspagem"
          style={{
            flex: 1,
            minWidth: 220,
            background: "#111",
            border: "1px solid #2a2a2a",
            borderRadius: 8,
            padding: "9px 12px",
            color: "#eee",
            fontFamily: "var(--font-dm-mono), monospace",
          }}
        />
        {btn("Raspar", testScrape, "scrape")}
      </div>
      <Card titulo="1 · /api/scrape" res={scrapeRes} />

      <div style={{ marginTop: 22, display: "flex", gap: 8 }}>
        {btn("Publicar LP de teste", testSave, "save")}
        {btn("Testar IA", testAI, "ai")}
      </div>
      <Card titulo="2 · /api/save + SSR /imoveis/[slug]" res={saveRes} />
      <Card titulo="3 · /api/ai (proxy Anthropic)" res={aiRes} />
    </main>
  );
}

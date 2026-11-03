/**
 * scripts/importar.mjs — manda as imobiliárias do CSV para o Redis.
 *
 *   node scripts/importar.mjs clientes.csv titulos.csv
 *
 * clientes.csv: codigo,imobiliaria,dominio,cidade,paginas,analisadas,ganho
 * titulos.csv:  codigo,titulo_atual,palavras_atual,titulo_otimizado,palavras_otimizado
 *
 * Palavras numa célula só, separadas por |, com o volume depois dos dois pontos:
 *   casa para alugar:49500|casa para alugar sorocaba:2900
 *
 * Os 3 primeiros títulos de cada código aparecem na página. O resto vai
 * inteiro para a planilha que o cliente recebe quando paga.
 */
import { readFileSync } from "node:fs";

const URL_REDIS = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!URL_REDIS || !TOKEN) {
  console.error("Faltam UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN no ambiente.");
  process.exit(1);
}

/** CSV com aspas, vírgula dentro de campo e quebra de linha dentro de aspas. */
function lerCsv(caminho) {
  const txt = readFileSync(caminho, "utf-8").replace(/^﻿/, "");
  const linhas = [];
  let campo = "", linha = [], aspas = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (aspas) {
      if (c === '"' && txt[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\n") { linha.push(campo); linhas.push(linha); linha = []; campo = ""; }
    else if (c !== "\r") campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }

  const cab = linhas.shift().map((h) => h.trim().toLowerCase());
  return linhas
    .filter((l) => l.some((v) => v.trim()))
    .map((l) => Object.fromEntries(cab.map((h, i) => [h, (l[i] || "").trim()])));
}

const inteiro = (v) => Number(String(v || "").replace(/[^\d-]/g, "")) || 0;

const palavras = (campo) =>
  String(campo || "")
    .split("|")
    .map((p) => p.trim())
    .filter((p) => p.includes(":"))
    .map((p) => {
      const i = p.lastIndexOf(":");
      return [p.slice(0, i).trim(), inteiro(p.slice(i + 1))];
    })
    .filter(([t]) => t);

async function gravar(chave, valor) {
  const r = await fetch(URL_REDIS, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(["SET", chave, JSON.stringify(valor)]),
  });
  if (!r.ok) throw new Error(`Redis ${r.status} em ${chave}`);
}

const [, , arqClientes = "clientes.csv", arqTitulos = "titulos.csv"] = process.argv;

const clientes = lerCsv(arqClientes);
const titulos = lerCsv(arqTitulos);

const porCodigo = {};
for (const t of titulos) {
  const c = (t.codigo || "").toUpperCase();
  if (c) (porCodigo[c] ||= []).push(t);
}

let n = 0;
for (const c of clientes) {
  const codigo = (c.codigo || "").toUpperCase();
  if (!codigo) continue;

  const lista = porCodigo[codigo] || [];
  const mapear = (t) => ({
    antes: t.titulo_atual || "",
    antesKw: palavras(t.palavras_atual),
    depois: t.titulo_otimizado || "",
    depoisKw: palavras(t.palavras_otimizado),
  });

  await gravar(`oferta:${codigo}`, {
    imobiliaria: c.imobiliaria || "",
    dominio: c.dominio || c.site || "",
    cidade: c.cidade || "",
    paginas: inteiro(c.paginas),
    analisadas: inteiro(c.analisadas),
    gratis: inteiro(c.gratis) || 100,
    pacote: inteiro(c.pacote) || 1000,
    ganho: inteiro(c.ganho),
    exemplos: lista.slice(0, 3).map(mapear),
    titulos: lista.map(mapear),
  });

  n++;
  console.log(`  ${codigo}  ${c.imobiliaria || c.dominio || ""}  (${lista.length} títulos)`);
}

console.log(`\n  ${n} códigos no ar. Teste em /seo-geo/${(clientes[0]?.codigo || "CODIGO").toUpperCase()}\n`);

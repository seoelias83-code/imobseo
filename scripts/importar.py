#!/usr/bin/env python3
"""
importar.py — manda as imobiliarias do CSV para o Redis (Upstash).

Mesma coisa que o importar.mjs, em Python, pra nao depender do Node.

    export UPSTASH_REDIS_REST_URL="https://seu-banco.upstash.io"
    export UPSTASH_REDIS_REST_TOKEN="o-token"
    python3 scripts/importar.py clientes.csv titulos.csv

clientes.csv: codigo,imobiliaria,dominio,cidade,paginas,analisadas,ganho
titulos.csv:  codigo,titulo_atual,palavras_atual,titulo_otimizado,palavras_otimizado

Palavras numa celula so, separadas por |, com o volume depois dos dois pontos:

    casa para alugar:49500|casa para alugar sorocaba:2900

Os 3 primeiros titulos de cada codigo aparecem na pagina. A lista inteira vai
pra planilha que o cliente recebe quando paga.
"""

import csv
import json
import os
import re
import sys
import urllib.error
import urllib.request

URL = os.environ.get("UPSTASH_REDIS_REST_URL", "").rstrip("/")
TOKEN = os.environ.get("UPSTASH_REDIS_REST_TOKEN", "")


def inteiro(v):
    try:
        return int(re.sub(r"[^\d-]", "", str(v or "")))
    except ValueError:
        return 0


def palavras(campo):
    """'casa para alugar:49500|condominio:1300' -> [['casa para alugar', 49500], ...]"""
    fora = []
    for parte in (campo or "").split("|"):
        parte = parte.strip()
        if ":" not in parte:
            continue
        termo, _, vol = parte.rpartition(":")
        if termo.strip():
            fora.append([termo.strip(), inteiro(vol)])
    return fora


def ler_csv(caminho):
    with open(caminho, newline="", encoding="utf-8-sig") as f:
        leitor = csv.DictReader(f)
        leitor.fieldnames = [(c or "").strip().lower() for c in (leitor.fieldnames or [])]
        return [
            {k: (v or "").strip() for k, v in linha.items() if k}
            for linha in leitor
            if any((v or "").strip() for v in linha.values())
        ]


def gravar(chave, valor):
    req = urllib.request.Request(
        URL,
        data=json.dumps(["SET", chave, json.dumps(valor, ensure_ascii=False)]).encode(),
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode())


def main():
    if not URL or not TOKEN:
        sys.exit(
            "Faltam as variaveis. Rode antes:\n"
            '  export UPSTASH_REDIS_REST_URL="https://seu-banco.upstash.io"\n'
            '  export UPSTASH_REDIS_REST_TOKEN="o-token"'
        )

    arq_clientes = sys.argv[1] if len(sys.argv) > 1 else "clientes.csv"
    arq_titulos = sys.argv[2] if len(sys.argv) > 2 else "titulos.csv"

    for p in (arq_clientes, arq_titulos):
        if not os.path.exists(p):
            sys.exit(f"nao achei {p}")

    clientes = ler_csv(arq_clientes)
    titulos = ler_csv(arq_titulos)

    por_codigo = {}
    for t in titulos:
        c = (t.get("codigo") or "").upper()
        if c:
            por_codigo.setdefault(c, []).append(t)

    def mapear(t):
        return {
            "antes": t.get("titulo_atual", ""),
            "antesKw": palavras(t.get("palavras_atual")),
            "depois": t.get("titulo_otimizado", ""),
            "depoisKw": palavras(t.get("palavras_otimizado")),
        }

    n = 0
    for c in clientes:
        codigo = (c.get("codigo") or "").upper()
        if not codigo:
            continue
        lista = por_codigo.get(codigo, [])
        dados = {
            "imobiliaria": c.get("imobiliaria", ""),
            "dominio": c.get("dominio") or c.get("site", ""),
            "cidade": c.get("cidade", ""),
            "paginas": inteiro(c.get("paginas")),
            "analisadas": inteiro(c.get("analisadas")),
            "gratis": inteiro(c.get("gratis")) or 100,
            "pacote": inteiro(c.get("pacote")) or 1000,
            "ganho": inteiro(c.get("ganho")),
            "exemplos": [mapear(t) for t in lista[:3]],
            "titulos": [mapear(t) for t in lista],
        }
        try:
            gravar(f"oferta:{codigo}", dados)
        except urllib.error.HTTPError as e:
            sys.exit(f"Redis recusou ({e.code}) no {codigo}. Confira a URL e o token.")
        except Exception as e:
            sys.exit(f"Nao consegui falar com o Redis: {e}")
        n += 1
        print(f"  {codigo}  {dados['imobiliaria'] or dados['dominio']}  ({len(lista)} titulos)")

    primeiro = (clientes[0].get("codigo") or "CODIGO").upper() if clientes else "CODIGO"
    print(f"\n  {n} codigos no ar. Teste em /seo-geo/{primeiro}\n")


if __name__ == "__main__":
    main()

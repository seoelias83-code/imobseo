import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { slugify, randomSuffix } from "@/lib/slug";

export const runtime = "nodejs";

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "json invalido" }, { status: 400 });
  }

  const { nome, html } = body || {};
  if (!html) {
    return NextResponse.json({ error: "campo html obrigatorio" }, { status: 400 });
  }

  const slug = slugify(nome) + "-" + randomSuffix();
  const key = "lp:" + slug;

  try {
    const redis = getRedis();
    await redis.set(key, { html, nome: nome || "", createdAt: Date.now() });

    // confirma a gravacao antes de devolver o slug.
    // se o storage soluçar, o app avisa em vez de dar uma URL fantasma.
    const check = await redis.get(key);
    if (!check || !check.html) {
      return NextResponse.json(
        { error: "gravacao nao confirmou no storage" },
        { status: 500 }
      );
    }

    return NextResponse.json({ slug, url: "/imoveis/" + slug });
  } catch (e) {
    return NextResponse.json(
      { error: "falha ao salvar", detail: String(e) },
      { status: 500 }
    );
  }
}

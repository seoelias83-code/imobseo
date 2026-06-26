import { NextResponse } from "next/server";
import { scrape } from "@/lib/scrape";

export const runtime = "nodejs";

export async function GET(req) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "parametro url obrigatorio" }, { status: 400 });
  }
  try {
    const data = await scrape(url);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "falha ao raspar a url", detail: String(e) },
      { status: 502 }
    );
  }
}

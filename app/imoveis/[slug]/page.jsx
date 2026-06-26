import { getRedis } from "@/lib/redis";
import { notFound } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  try {
    const data = await getRedis().get("lp:" + slug);
    if (data && data.nome) return { title: data.nome };
  } catch {}
  return { title: "Imovel" };
}

export default async function LandingPage({ params }) {
  const { slug } = await params;
  let data = null;
  try {
    data = await getRedis().get("lp:" + slug);
  } catch {
    data = null;
  }
  if (!data || !data.html) notFound();

  // HTML renderizado no servidor: crawler ve o conteudo completo,
  // sem loader / document.write.
  return <div dangerouslySetInnerHTML={{ __html: data.html }} />;
}

import { redirect } from "next/navigation";

// A UI da ferramenta e um app HTML self-contained em /public/app.html.
// A home (/) redireciona pra ela. As chamadas /api/scrape, /api/save e /api/ai
// sao same-origin, entao funcionam normalmente a partir de /app.html no dominio.
export default function Home() {
  redirect("/app.html");
}

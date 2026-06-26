import { Syne, DM_Mono, DM_Sans } from "next/font/google";
import "./globals.css";

const syne = Syne({ subsets: ["latin"], variable: "--font-syne" });
const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
});
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });

export const metadata = {
  title: "IMOBSEO",
  description: "Gerador de landing page de imovel",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="pt-BR"
      className={`${syne.variable} ${dmMono.variable} ${dmSans.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}

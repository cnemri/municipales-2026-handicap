import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Handicap & Municipales 2026",
  description: "Analyse des programmes politiques pour les élections municipales françaises 2026 concernant le handicap.",
  authors: [{ name: "Chouaieb Nemri", url: "https://linkedin.com/in/nemri" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="scroll-smooth">
      <body className={`${inter.className} bg-slate-50 text-slate-900 antialiased`}>{children}</body>
    </html>
  );
}
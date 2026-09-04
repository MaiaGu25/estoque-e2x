import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Estoque E2X Igor",
  description: "Controle interno de estoque, ordens e movimentações da E2X.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}

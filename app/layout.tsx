import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ON.ADV | Gestão interna",
  description: "Relacionamentos, agenda e registro diário do Oton Nasser Advocacia.",
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

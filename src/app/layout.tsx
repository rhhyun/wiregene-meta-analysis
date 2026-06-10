import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Research Briefing Platform",
  description: "PubMed, news, database, and Zotero connected research briefing platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="antialiased">
      <body>{children}</body>
    </html>
  );
}

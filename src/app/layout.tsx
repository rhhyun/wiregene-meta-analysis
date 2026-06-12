import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wiregene Meta",
  description: "Wiregene systematic review and meta-analysis workspace.",
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

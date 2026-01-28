import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Illusions - 日本語小説エディター",
  description: "A professional Japanese novel editor with vertical writing support",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}

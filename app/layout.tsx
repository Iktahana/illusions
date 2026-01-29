"use client";

import "./globals.css";
import { ThemeProvider } from "../contexts/ThemeContext";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <title>被愛妄想罪.mdi - Illusions</title>
        <meta name="description" content="A professional Japanese novel editor with vertical writing support" />
      </head>
      <body className="antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

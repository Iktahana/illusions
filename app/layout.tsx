"use client";

import "./globals.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <title>Illusions - 日本語小説エディター</title>
        <meta name="description" content="A professional Japanese novel editor with vertical writing support" />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}

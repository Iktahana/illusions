"use client";

import "./globals.css";
import { ThemeProvider } from "../contexts/ThemeContext";
import { EditorModeProvider } from "../contexts/EditorModeContext";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <title>Illusions - 縦書き対応の日本語小説エディタ</title>
        <meta
          name="description"
          content="縦書きに対応した、日本語小説のための執筆エディタです。"
        />
        <link rel="icon" href="/favicon.png" sizes="any" />
        <link rel="icon" href="/icon/illusions-32.png" sizes="32x32" type="image/png" />
        <link rel="icon" href="/icon/illusions-16.png" sizes="16x16" type="image/png" />
        <link rel="apple-touch-icon" href="/icon/illusions-180.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme');
                  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  var isDark = theme === 'dark' || (!theme && prefersDark);
                  if (isDark) {
                    document.documentElement.classList.add('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <EditorModeProvider>{children}</EditorModeProvider>
        </ThemeProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}

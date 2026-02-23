import "./globals.css";
import { ThemeProvider } from "../contexts/ThemeContext";
import { EditorModeProvider } from "../contexts/EditorModeContext";
import { NotificationContainer } from "@/components/NotificationContainer";
import AnalyticsLoader from "@/components/AnalyticsLoader";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <meta
          name="description"
          content="縦書きに対応した、日本語小説のための執筆エディタです。"
        />
        <link rel="icon" type="image/x-icon" href="./favicon.ico" />
        <link rel="icon" href="./favicon.png" sizes="any" />
        <link rel="icon" href="./icon/illusions-32.png" sizes="32x32" type="image/png" />
        <link rel="icon" href="./icon/illusions-16.png" sizes="16x16" type="image/png" />
        <link rel="apple-touch-icon" href="./icon/illusions-180.png" />
        <link rel="manifest" href="./site.webmanifest" />
        <meta name="theme-color" content="#0f172a" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
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
        <NotificationContainer />
        {/* Only load analytics in web environment (client-side check) */}
        <AnalyticsLoader />
      </body>
    </html>
  );
}

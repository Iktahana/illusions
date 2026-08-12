import "./globals.css";
import { ThemeProvider } from "../contexts/ThemeContext";
import { EditorModeProvider } from "../contexts/EditorModeContext";
import { AuthProvider } from "../contexts/AuthContext";
import { KeymapProvider } from "../contexts/KeymapContext";
import { NotificationContainer } from "@/components/NotificationContainer";
import { ErrorReportingRuntime } from "@/components/ErrorReportingRuntime";
import { MdiRuntimeProvider } from "@/components/MdiRuntimeProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <meta name="description" content="縦書きに対応した、日本語小説のための執筆エディタです。" />
        <link rel="icon" type="image/x-icon" href="./favicon.ico" />
        <link rel="icon" href="./favicon.png" sizes="any" />
        <link rel="icon" href="./icon/illusions-32.png" sizes="32x32" type="image/png" />
        <link rel="icon" href="./icon/illusions-16.png" sizes="16x16" type="image/png" />
        <meta name="theme-color" content="#0f172a" />
        {/* External theme init script to avoid CSP unsafe-inline */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- intentionally synchronous to prevent theme FOUC */}
        <script src="./theme-init.js" />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <AuthProvider>
            <EditorModeProvider>
              <KeymapProvider>
                <MdiRuntimeProvider>{children}</MdiRuntimeProvider>
              </KeymapProvider>
            </EditorModeProvider>
          </AuthProvider>
        </ThemeProvider>
        <NotificationContainer />
        <ErrorReportingRuntime />
      </body>
    </html>
  );
}

"use client";

/**
 * TerminalPanel — xterm.js renderer component for embedded terminal tabs.
 *
 * Lifecycle:
 *  - Mount: creates Terminal, attaches FitAddon, connects to PTY session via IPC
 *  - Unmount: unsubscribes from data events, disposes xterm instance (PTY session is NOT killed)
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";

import type { TerminalStatus } from "@/lib/tab-manager/tab-types";
import { useTerminalSettings } from "@/contexts/EditorSettingsContext";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TerminalPanelProps {
  /** PTY session ID (empty string while connecting) */
  sessionId: string;
  /** Current status of the terminal tab */
  status: TerminalStatus;
  /** Exit code reported by the PTY process (null when still running) */
  exitCode: number | null;
  /** Called when the PTY process exits so the parent can update tab state */
  onExit?: (exitCode: number) => void;
}

// ---------------------------------------------------------------------------
// xterm theme — mirrors app CSS custom properties
// Dark theme: bg #080808, fg #f2f2f2
// Light theme: bg #fcfcfc, fg #0c0c0c
// We derive the appropriate values from the document root at mount time.
// ---------------------------------------------------------------------------

function resolveThemeColor(property: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(property).trim();
  if (!raw) return fallback;
  // CSS values are in "R G B" space-separated format (used with rgb())
  return `rgb(${raw})`;
}

function buildXtermTheme(
  ansiColors: Record<string, string>,
  background: string,
  foreground: string,
): Record<string, string> {
  return {
    background,
    foreground,
    cursor: foreground,
    cursorAccent: background,
    selectionBackground: resolveThemeColor("--accent-light", "#e6e6e6"),
    // ANSI colors from user settings
    black: ansiColors.black ?? "#000000",
    red: ansiColors.red ?? "#dc2626",
    green: ansiColors.green ?? "#16a34a",
    yellow: ansiColors.yellow ?? "#ca8a04",
    blue: ansiColors.blue ?? "#2563eb",
    magenta: ansiColors.magenta ?? "#9333ea",
    cyan: ansiColors.cyan ?? "#0d9488",
    white: ansiColors.white ?? "#d4d4d4",
    brightBlack: ansiColors.brightBlack ?? "#737373",
    brightRed: ansiColors.brightRed ?? "#ef4444",
    brightGreen: ansiColors.brightGreen ?? "#22c55e",
    brightYellow: ansiColors.brightYellow ?? "#eab308",
    brightBlue: ansiColors.brightBlue ?? "#3b82f6",
    brightMagenta: ansiColors.brightMagenta ?? "#a855f7",
    brightCyan: ansiColors.brightCyan ?? "#14b8a6",
    brightWhite: ansiColors.brightWhite ?? "#f5f5f5",
  };
}

// ---------------------------------------------------------------------------
// TerminalPanel component
// ---------------------------------------------------------------------------

export default function TerminalPanel({
  sessionId,
  status,
  exitCode,
  onExit,
}: TerminalPanelProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const cleanupDataRef = useRef<(() => void) | null>(null);
  const cleanupExitRef = useRef<(() => void) | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  // User terminal settings
  const {
    terminalBackground,
    terminalForeground,
    terminalFontFamily,
    terminalFontSize,
    terminalLineHeight,
    terminalCursorStyle,
    terminalCursorBlink,
    terminalScrollback,
    terminalCopyOnSelect,
    terminalMacOptionIsMeta,
    terminalAnsiColors,
  } = useTerminalSettings();

  // ---------------------------------------------------------------------------
  // Terminal initialization and PTY attachment
  // ---------------------------------------------------------------------------

  const initTerminal = useCallback(async () => {
    if (!containerRef.current || !sessionId) return;

    const ptyApi = window.electronAPI?.pty;
    if (!ptyApi) {
      setInitError("PTY APIが利用できません。Electron環境でのみ使用できます。");
      return;
    }

    // Dynamic imports to avoid SSR issues
    const [{ Terminal: XTerm }, { FitAddon }] = await Promise.all([
      import("@xterm/xterm"),
      import("@xterm/addon-fit"),
    ]);

    // Create terminal instance with user settings
    const terminal = new XTerm({
      theme: buildXtermTheme(terminalAnsiColors, terminalBackground, terminalForeground),
      fontFamily: terminalFontFamily,
      fontSize: terminalFontSize,
      lineHeight: terminalLineHeight,
      cursorStyle: terminalCursorStyle,
      cursorBlink: terminalCursorBlink,
      scrollback: terminalScrollback,
      allowTransparency: false,
      macOptionIsMeta: terminalMacOptionIsMeta,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // Open terminal in the container element
    terminal.open(containerRef.current);
    fitAddon.fit();

    // Copy-on-select: copy selected text to clipboard when selection changes
    if (terminalCopyOnSelect) {
      terminal.onSelectionChange(() => {
        const selection = terminal.getSelection();
        if (selection) {
          void navigator.clipboard.writeText(selection).catch(() => {
            // Clipboard write failed (e.g. no focus)
          });
        }
      });
    }

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // --- Attach to PTY session ---
    // Register the live data listener BEFORE calling attach() to prevent
    // output loss during the gap between backlog retrieval and listener setup.
    // Any data arriving while attach() is in-flight is captured immediately.
    const unsubData = ptyApi.onData((payload) => {
      if (payload.sessionId !== sessionId) return;
      terminal.write(payload.data);
    });
    cleanupDataRef.current = unsubData;

    const attachResult = await ptyApi.attach(sessionId);

    if ("error" in attachResult) {
      setInitError(`セッションへの接続に失敗しました: ${attachResult.error}`);
      unsubData();
      cleanupDataRef.current = null;
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      return;
    }

    // Write buffered output first; live events registered above will follow.
    if (attachResult.outputBuffer) {
      terminal.write(attachResult.outputBuffer);
    }

    // If the PTY already exited while the panel was unmounted, notify parent immediately
    if (attachResult.status === "exited" || attachResult.status === "killed") {
      onExit?.(attachResult.exitCode ?? 0);
      return;
    }

    // Subscribe to PTY exit events
    const unsubExit = ptyApi.onExit((payload) => {
      if (payload.sessionId !== sessionId) return;
      onExit?.(payload.exitCode);
    });
    cleanupExitRef.current = unsubExit;

    // Forward keystrokes to PTY
    terminal.onData((data) => {
      void ptyApi.write(sessionId, data);
    });

    // ResizeObserver: fit terminal on container resize
    const observer = new ResizeObserver(() => {
      if (!fitAddonRef.current || !terminalRef.current) return;
      try {
        fitAddonRef.current.fit();
        const dims = fitAddonRef.current.proposeDimensions();
        if (dims) {
          void ptyApi.resize(sessionId, dims.cols, dims.rows);
        }
      } catch {
        // Ignore resize errors (e.g. terminal disposed)
      }
    });
    observer.observe(containerRef.current);
    resizeObserverRef.current = observer;

    // Fit once more after layout settles
    requestAnimationFrame(() => {
      if (!fitAddonRef.current || !terminalRef.current) return;
      try {
        fitAddonRef.current.fit();
        const dims = fitAddonRef.current.proposeDimensions();
        if (dims) {
          void ptyApi.resize(sessionId, dims.cols, dims.rows);
        }
      } catch {
        // Ignore
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- settings are captured at init time; terminal is recreated on sessionId change
  }, [sessionId, onExit]);

  useEffect(() => {
    if (status !== "running" && status !== "connecting") return;
    if (!sessionId) return;

    void initTerminal();

    return () => {
      // Cleanup data and exit listeners
      cleanupDataRef.current?.();
      cleanupDataRef.current = null;
      cleanupExitRef.current?.();
      cleanupExitRef.current = null;

      // Cleanup ResizeObserver
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;

      // Dispose xterm (detaches from DOM, releases resources)
      // Note: do NOT kill the PTY session here — it should survive tab switches
      terminalRef.current?.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId, status, initTerminal]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (status === "connecting") {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-foreground-secondary text-sm">
        {/* Spinner */}
        <svg
          className="animate-spin h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <span>接続中...</span>
      </div>
    );
  }

  if (status === "exited") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-foreground-secondary text-sm">
        <span>
          プロセスが終了しました
          {exitCode !== null ? ` (code: ${exitCode})` : ""}
        </span>
      </div>
    );
  }

  if (status === "error" || initError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-error text-sm p-4">
        <span className="font-medium">エラーが発生しました</span>
        {initError && (
          <span className="text-foreground-secondary text-xs text-center max-w-md">
            {initError}
          </span>
        )}
      </div>
    );
  }

  // Running state: render xterm container
  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden terminal-panel-container"
      data-session-id={sessionId}
      style={{ padding: "4px", backgroundColor: "#000000" }}
    />
  );
}

export default function StartupRestoreScreen() {
  return (
    <div
      className="h-screen bg-background flex items-center justify-center"
      data-testid="startup-restore-screen"
    >
      <div
        className="flex flex-col items-center gap-3 text-center"
        role="status"
        aria-live="polite"
      >
        <div
          className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-foreground-secondary"
          aria-hidden="true"
        />
        <p className="text-sm text-foreground-secondary">前回の作業状態を復元しています…</p>
        <p className="text-xs text-foreground-tertiary">しばらくお待ちください</p>
      </div>
    </div>
  );
}

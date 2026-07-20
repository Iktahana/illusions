/**
 * Runs the startup check queue once per app start (after the boot sequence),
 * surfacing toasts such as "dictionary not downloaded / update available".
 */
import { useEffect, useRef } from "react";
import { startupCheckQueue } from "@/lib/services/startup-check-queue";
import { dictUpdateCheck } from "@/lib/services/startup-checks/dict-update-check";
import { dictCorruptCheck } from "@/lib/services/startup-checks/dict-corrupt-check";
import { rulesetUpdateCheck } from "@/lib/services/startup-checks/ruleset-update-check";

// Register built-in checks once at module load. register() is idempotent per id.
// Corrupt is checked before update: a corrupt DB needs re-download regardless of version.
startupCheckQueue.register(dictCorruptCheck);
startupCheckQueue.register(dictUpdateCheck);
// 校正ルールセットの更新確認（Electron 専用。自動更新が ON なら即適用）。
startupCheckQueue.register(rulesetUpdateCheck);

export function useStartupChecks(): void {
  const ranRef = useRef(false);
  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    void startupCheckQueue.run();
  }, []);
}

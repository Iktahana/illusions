/**
 * Runs the startup check queue once per app start (after the boot sequence),
 * surfacing toasts such as "dictionary not downloaded / update available".
 */
import { useEffect, useRef } from "react";
import { startupCheckQueue } from "@/lib/services/startup-check-queue";
import { dictUpdateCheck } from "@/lib/services/startup-checks/dict-update-check";
import { dictCorruptCheck } from "@/lib/services/startup-checks/dict-corrupt-check";

// Register built-in checks once at module load. register() is idempotent per id.
// Corrupt is checked before update: a corrupt DB needs re-download regardless of version.
startupCheckQueue.register(dictCorruptCheck);
startupCheckQueue.register(dictUpdateCheck);

export function useStartupChecks(): void {
  const ranRef = useRef(false);
  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    void startupCheckQueue.run();
  }, []);
}

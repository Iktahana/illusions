"use client";

/**
 * Re-export from the refactored tab-manager module.
 * Keeps backward compatibility for `import { useTabManager } from "@/lib/use-tab-manager"`.
 */
export { useTabManager } from "./tab-manager";
export type { UseTabManagerReturn } from "./tab-manager/types";

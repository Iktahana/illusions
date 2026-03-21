"use client";

/**
 * Hook to track LLM inference status for the status indicator dot.
 *
 * Cloud models are always "ready" when enabled — no model polling needed.
 * Only inference events change the status.
 */

import { useEffect, useState } from "react";
import { getLlmClient } from "@/lib/llm-client/llm-client";

export type LlmStatusState = "off" | "ready" | "inferring";

/**
 * Returns the current LLM status.
 * - "off"       — AI features disabled or no provider config set
 * - "ready"     — provider configured, ready to infer
 * - "inferring" — inference in progress
 */
export function useLlmStatus(llmEnabled: boolean): LlmStatusState {
  const [isInferring, setIsInferring] = useState(false);
  const [isAvailable, setIsAvailable] = useState(() => getLlmClient().isAvailable());

  useEffect(() => {
    // Re-check availability when the component re-renders (provider config may have changed)
    setIsAvailable(getLlmClient().isAvailable());
  });

  useEffect(() => {
    const onStart = () => setIsInferring(true);
    const onEnd = () => setIsInferring(false);

    window.addEventListener("llm:inference-start", onStart);
    window.addEventListener("llm:inference-end", onEnd);

    return () => {
      window.removeEventListener("llm:inference-start", onStart);
      window.removeEventListener("llm:inference-end", onEnd);
    };
  }, []);

  if (!llmEnabled || !isAvailable) return "off";
  if (isInferring) return "inferring";
  return "ready";
}

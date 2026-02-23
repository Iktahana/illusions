"use client";

/**
 * Hook to track LLM model status for the status indicator dot.
 *
 * Maps the LLM client's model status into a simplified four-state enum
 * and listens for inference events dispatched by the LLM client.
 */

import { useEffect, useState } from "react";
import { getLlmClient } from "@/lib/llm-client/llm-client";

export type LlmStatusState = "off" | "loading" | "ready" | "inferring";

const POLL_INTERVAL_MS = 3000;

/**
 * Poll the LLM client for the selected model's status and listen for
 * inference start/end events on `window`.
 */
export function useLlmStatus(
  llmEnabled: boolean,
  llmModelId: string,
): LlmStatusState {
  const [baseStatus, setBaseStatus] = useState<LlmStatusState>("off");
  const [isInferring, setIsInferring] = useState(false);

  // Poll model status
  useEffect(() => {
    if (!llmEnabled || !llmModelId) {
      setBaseStatus("off");
      return;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        const client = getLlmClient();
        if (!client.isAvailable()) {
          if (!cancelled) setBaseStatus("off");
          return;
        }
        const models = await client.getModels();
        if (cancelled) return;

        const model = models.find((m) => m.id === llmModelId);
        if (!model) {
          setBaseStatus("off");
          return;
        }

        switch (model.status) {
          case "loading":
            setBaseStatus("loading");
            break;
          case "loaded":
          case "ready":
            // "loaded" = in memory, "ready" = downloaded on disk
            // Both mean model is available when llmEnabled is true
            setBaseStatus("ready");
            break;
          default:
            // not-downloaded, downloading, error
            setBaseStatus("off");
            break;
        }
      } catch {
        if (!cancelled) setBaseStatus("off");
      }
    };

    // Initial poll
    void poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [llmEnabled, llmModelId]);

  // Listen for inference events
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

  // Inferring overrides any base status (including "off" during forced validation)
  if (isInferring) {
    return "inferring";
  }

  return baseStatus;
}

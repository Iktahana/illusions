/**
 * React hook exposing the set of "known" terms for the current editor mode —
 * words that dictionary-matching lint rules must not flag as 辞書外語.
 *
 * Mirrors use-ignored-corrections: loads on mount / mode change with a stale
 * guard, and additionally reloads whenever the user dictionary is written
 * (subscribe via user-dictionary-service) so adding/removing a word refreshes
 * the editor marks instantly.
 *
 * 辞書照合ルールがマークすべきでない「既知語」集合を提供するフック。
 */

import { useEffect, useState } from "react";

import { collectKnownTerms } from "@/lib/linting/known-terms";
import { subscribeUserDictionaryChange } from "@/lib/services/user-dictionary-service";
import type { EditorMode } from "@/lib/project/project-types";

const EMPTY: ReadonlySet<string> = new Set();

/**
 * Collect known terms (user dictionary + any registered dictionary-ruleset
 * sources) for the given editor mode.
 *
 * @param editorMode Current editor mode (project / standalone / null)
 */
export function useKnownTerms(editorMode: EditorMode): ReadonlySet<string> {
  const [knownTerms, setKnownTerms] = useState<ReadonlySet<string>>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    const reload = (): void => {
      if (!editorMode) {
        setKnownTerms(EMPTY);
        return;
      }
      collectKnownTerms({ editorMode })
        .then((terms) => {
          if (!cancelled) setKnownTerms(terms);
        })
        .catch((err) => {
          console.warn("[useKnownTerms] Failed to collect known terms:", err);
          if (!cancelled) setKnownTerms(EMPTY);
        });
    };

    reload();
    // User dictionary writes happen through Dictionary.tsx; reload so marks
    // appear/disappear without a manual refresh.
    const unsubscribe = subscribeUserDictionaryChange(reload);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [editorMode]);

  return knownTerms;
}

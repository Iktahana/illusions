/**
 * React hook for quick user-dictionary actions invoked from lint UI.
 *
 * Adds a word to the user dictionary (project or standalone scope) so that the
 * known-terms pipeline (#1888) immediately suppresses its "out of dictionary"
 * squiggle. The host owns this write; rulesets only declare intent via the
 * `suggestsDictionaryEntry` manifest flag.
 *
 * ユーザー辞書への語追加（校正カード／波線メニューから）を担うフック。
 */

import { useCallback } from "react";

import { getUserDictionaryService } from "@/lib/services/user-dictionary-service";
import { notificationManager } from "@/lib/services/notification-manager";
import { isProjectMode, isStandaloneMode } from "@/lib/project/project-types";
import type { EditorMode } from "@/lib/project/project-types";

export interface UseUserDictionaryActionsResult {
  /**
   * Add a word to the user dictionary for the current editor mode. No-ops on a
   * blank word; skips with an info toast when the word is already registered.
   */
  addWordToUserDictionary: (word: string) => Promise<void>;
}

/**
 * Provides user-dictionary mutation actions scoped to the current editor mode.
 *
 * @param editorMode Current editor mode (project / standalone / null).
 */
export function useUserDictionaryActions(editorMode: EditorMode): UseUserDictionaryActionsResult {
  const addWordToUserDictionary = useCallback(
    async (rawWord: string): Promise<void> => {
      const word = rawWord.trim();
      if (!word) return;
      if (!editorMode) return;

      const service = getUserDictionaryService();
      try {
        if (isProjectMode(editorMode)) {
          const existing = await service.loadEntries();
          if (existing.some((e) => e.word === word)) {
            notificationManager.info(`「${word}」は既にユーザー辞書に登録されています`);
            return;
          }
          await service.addEntry({ id: crypto.randomUUID(), word });
        } else if (isStandaloneMode(editorMode)) {
          const fileName = editorMode.fileName;
          const existing = await service.loadEntriesStandalone(fileName);
          if (existing.some((e) => e.word === word)) {
            notificationManager.info(`「${word}」は既にユーザー辞書に登録されています`);
            return;
          }
          await service.addEntryStandalone(fileName, { id: crypto.randomUUID(), word });
        } else {
          return;
        }
        notificationManager.success(`「${word}」をユーザー辞書に追加しました`);
      } catch (err) {
        console.error("[useUserDictionaryActions] Failed to add word:", err);
        notificationManager.error("ユーザー辞書への追加に失敗しました");
      }
    },
    [editorMode],
  );

  return { addWordToUserDictionary };
}

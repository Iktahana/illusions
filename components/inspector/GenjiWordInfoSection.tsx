"use client";

import type React from "react";
import clsx from "clsx";

import { useGenjiWordInfo } from "@/lib/utils/genji-word-info";

interface GenjiWordInfoSectionProps {
  /** 選択中の語（空またはnullのとき非表示） */
  selectedWord: string | null | undefined;
  /** 余白を詰めた compact レイアウトにする（Inspector の compactMode 連動） */
  compact?: boolean;
}

/**
 * 選択語の幻辞（Genji）辞書情報を表示するインスペクタセクション。
 *
 * Inspector のタブバー直下に常駐し、どのタブでも語を選択すると表示される（#1639）。
 * - 幻辞が未インストール / オフライン / 該当語なし のときは何も表示しない（null）。
 * - 読み中はスケルトンローダーを表示し、品詞ハイライト本体の動作を一切変えない。
 */
export default function GenjiWordInfoSection({
  selectedWord,
  compact = false,
}: GenjiWordInfoSectionProps): React.ReactElement | null {
  const state = useGenjiWordInfo(selectedWord);

  if (state.status === "idle" || state.status === "unavailable") {
    return null;
  }

  return (
    <div
      className={clsx(
        "flex-shrink-0 border-b border-border bg-background-secondary",
        compact ? "px-3 py-2" : "px-4 py-3",
      )}
    >
      <p className="text-xs font-medium text-foreground-tertiary uppercase tracking-wide mb-2">
        選択語の辞書情報
      </p>

      {state.status === "loading" && (
        <div className="space-y-1 animate-pulse">
          <div className="h-3 bg-foreground-muted/20 rounded w-2/3" />
          <div className="h-3 bg-foreground-muted/20 rounded w-1/2" />
        </div>
      )}

      {state.status === "not-found" && (
        <p className="text-xs text-foreground-tertiary">該当する辞書項目がありません</p>
      )}

      {state.status === "found" && (
        <div className="space-y-2">
          {/* 見出し・読み・品詞 */}
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground">{state.viewModel.word}</span>
            {state.viewModel.reading && (
              <span className="text-xs text-foreground-secondary">{state.viewModel.reading}</span>
            )}
            {state.viewModel.partOfSpeech && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">
                {state.viewModel.partOfSpeech}
              </span>
            )}
            {state.viewModel.register && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-foreground-muted/10 text-foreground-secondary">
                {state.viewModel.register}
              </span>
            )}
          </div>

          {/* 語義 */}
          {state.viewModel.glosses.length > 0 && (
            <ol className="list-decimal list-inside space-y-0.5 pl-0.5">
              {state.viewModel.glosses.map((gloss, i) => (
                <li key={i} className="text-xs text-foreground-secondary leading-relaxed">
                  {gloss}
                </li>
              ))}
            </ol>
          )}

          {/* 類義語 */}
          {state.viewModel.synonyms.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-xs text-foreground-tertiary shrink-0">類義語：</span>
              {state.viewModel.synonyms.map((syn, i) => (
                <span
                  key={i}
                  className="text-xs px-1.5 py-0.5 rounded bg-foreground-muted/10 text-foreground-secondary"
                >
                  {syn}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

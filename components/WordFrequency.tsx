"use client";

import { useState, useEffect, useMemo } from "react";
import { RefreshCw } from "lucide-react";
import clsx from "clsx";

// Use NLP client abstraction
import { getNlpClient } from "@/lib/nlp-client/nlp-client";
import type { WordEntry } from "@/lib/nlp-client/types";

interface WordFrequencyProps {
  /** エディタのテキストコンテンツ */
  content: string;
}

export default function WordFrequency({ content }: WordFrequencyProps) {
  const [words, setWords] = useState<WordEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAnalyzedContent, setLastAnalyzedContent] = useState<string>("");
  const [cacheTimestamp, setCacheTimestamp] = useState<number>(0);

  // コンテンツを解析
  const analyzeContent = async (force = false) => {
    // キャッシュが有効で、強制更新でない場合はスキップ
    if (!force && content === lastAnalyzedContent && words.length > 0) {
      return;
    }

    if (!content.trim()) {
      setWords([]);
      setLastAnalyzedContent("");
      setCacheTimestamp(0);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nlpClient = getNlpClient();
      
      // Use backend word frequency analysis
      const wordEntries = await nlpClient.analyzeWordFrequency(content);
      
      setWords(wordEntries);
      setLastAnalyzedContent(content);
      setCacheTimestamp(Date.now());
    } catch (err) {
      console.error("[WordFrequency] Analysis error:", err);
      setError("解析に失敗しました");
    } finally {
      setIsLoading(false);
    }
  };

  // 初回マウント時と content 変更時に自動解析
  useEffect(() => {
    // 内容が変わった場合のみ再解析
    if (content !== lastAnalyzedContent) {
      const timer = setTimeout(() => {
        analyzeContent();
      }, 1000); // 1秒のデバウンス
      
      return () => clearTimeout(timer);
    }
  }, [content, lastAnalyzedContent]);

  // 統計情報
  const stats = useMemo(() => {
    const totalWords = words.reduce((sum, w) => sum + w.count, 0);
    const uniqueWords = words.length;
    return { totalWords, uniqueWords };
  }, [words]);

  // 品詞の色を取得（pos-colors.ts の DEFAULT_POS_COLORS と統一）
  const getPosColorHex = (pos: string): string | null => {
    switch (pos) {
      case "名詞": return "#4A90E2";
      case "動詞": return "#27AE60";
      case "形容詞": return "#00A8FF";
      case "副詞": return "#E84393";
      case "助詞": return "#8E44AD";
      case "助動詞": return "#E67E22";
      case "接続詞": return "#D4A017";
      case "連体詞": return "#6C5CE7";
      case "感動詞": return "#FF7675";
      case "記号": return "#7F8C8D";
      default: return null;
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* ヘッダー */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-border">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">語彙統計</h2>
          <button
            onClick={() => analyzeContent(true)}
            disabled={isLoading}
            className={clsx(
              "p-1 rounded hover:bg-hover transition-colors",
              isLoading && "animate-spin"
            )}
            title="再解析"
          >
            <RefreshCw className="w-4 h-4 text-foreground-tertiary" />
          </button>
        </div>
        
        {/* 統計サマリー */}
        <div className="flex gap-4 mt-2 text-xs text-foreground-tertiary">
          <span>総語数: <span className="text-foreground">{stats.totalWords}</span></span>
          <span>異なり語数: <span className="text-foreground">{stats.uniqueWords}</span></span>
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="px-3 py-2 text-xs text-red-500 bg-red-500/10">
          {error}
        </div>
      )}

      {/* ローディング */}
      {isLoading && (
        <div className="px-3 py-4 text-center text-xs text-foreground-tertiary">
          解析中...
        </div>
      )}

      {/* 単語リスト */}
      <div className="flex-1 overflow-y-auto">
        {words.length === 0 && !isLoading ? (
          <div className="px-3 py-4 text-center text-xs text-foreground-tertiary">
            {content.trim() ? "単語が見つかりません" : "テキストを入力してください"}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {words.map((entry, index) => (
              <div
                key={`${entry.word}-${index}`}
                className="px-3 py-1.5 hover:bg-hover flex items-center justify-between gap-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm text-foreground truncate">
                      {entry.word}
                    </span>
                    {entry.reading && (
                      <span className="text-xs text-foreground-tertiary">
                        ({entry.reading})
                      </span>
                    )}
                  </div>
                  <span className="text-xs" style={{ color: getPosColorHex(entry.pos) ?? undefined }}>
                    {entry.pos}
                  </span>
                </div>
                <div className="flex-shrink-0 flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {entry.count}
                  </span>
                  {/* 使用頻度バー */}
                  <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full"
                      style={{
                        width: `${Math.min(100, (entry.count / (words[0]?.count || 1)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

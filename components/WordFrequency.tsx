"use client";

import { useState, useEffect, useMemo } from "react";
import { RefreshCw } from "lucide-react";
import clsx from "clsx";

// CDN tokenizer を使用
import { cdnTokenizer } from "@/packages/milkdown-plugin-japanese-novel/pos-highlight/tokenizer-cdn";
import type { Token } from "@/packages/milkdown-plugin-japanese-novel/pos-highlight/types";

interface WordFrequencyProps {
  /** エディタのテキストコンテンツ */
  content: string;
}

interface WordEntry {
  word: string;
  reading?: string;
  pos: string;
  count: number;
}

// 除外する品詞（助詞、助動詞、記号など）
const EXCLUDED_POS = new Set([
  "助詞",
  "助動詞", 
  "記号",
  "フィラー",
  "その他",
]);

// 除外する品詞詳細
const EXCLUDED_POS_DETAILS = new Set([
  "非自立",      // 動詞・形容詞の非自立
  "接尾",        // 名詞の接尾
  "数",          // 数詞
  "代名詞",      // 代名詞
  "句点",        // 。
  "読点",        // 、
  "空白",        // スペース
  "括弧開",      // 「（
  "括弧閉",      // 」）
]);

// 除外する文字パターン（記号・句読点など）
const EXCLUDED_CHARS_PATTERN = /^[。、！？!?「」『』（）()【】［］\[\]・…―－ー〜～：；:;，,．.　\s]+$/;

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
      const tokens = await cdnTokenizer.tokenize(content);
      
      // 単語をカウント
      const wordMap = new Map<string, WordEntry>();
      
      for (const token of tokens) {
        // 除外品詞をスキップ
        if (EXCLUDED_POS.has(token.pos)) continue;
        
        // 除外品詞詳細をスキップ
        if (token.pos_detail_1 && EXCLUDED_POS_DETAILS.has(token.pos_detail_1)) continue;
        
        // 空白や改行をスキップ
        if (!token.surface.trim()) continue;
        
        // 記号・句読点パターンをスキップ
        if (EXCLUDED_CHARS_PATTERN.test(token.surface)) continue;
        
        // 基本形をキーとして使用（なければ表層形）
        const key = token.basic_form && token.basic_form !== "*" 
          ? token.basic_form 
          : token.surface;
        
        const existing = wordMap.get(key);
        if (existing) {
          existing.count++;
        } else {
          wordMap.set(key, {
            word: key,
            reading: token.reading !== "*" ? token.reading : undefined,
            pos: token.pos,
            count: 1,
          });
        }
      }
      
      // カウント順にソート
      const sorted = Array.from(wordMap.values())
        .sort((a, b) => b.count - a.count);
      
      setWords(sorted);
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

  // 品詞の色を取得
  const getPosColor = (pos: string): string => {
    switch (pos) {
      case "動詞": return "text-green-500";
      case "名詞": return "text-blue-400";
      case "形容詞": return "text-blue-500";
      case "副詞": return "text-orange-500";
      case "接続詞": return "text-teal-500";
      case "感動詞": return "text-pink-500";
      case "連体詞": return "text-indigo-500";
      default: return "text-foreground-secondary";
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
                  <span className={clsx("text-xs", getPosColor(entry.pos))}>
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

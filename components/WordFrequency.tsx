"use client";

import { useState, useEffect, useMemo, useCallback, memo, useRef } from "react";
import { RefreshCw, LoaderCircle, ChevronRight, ChevronDown } from "lucide-react";
import clsx from "clsx";

import ContextMenu from "@/shared/ui/ContextMenu";
import { useContextMenu } from "@/lib/hooks/use-context-menu";
import { getNlpClient } from "@/lib/nlp-client/nlp-client";
import { getProjectFileService } from "@/lib/services/project-file-service";
import { MdiDocument } from "@/packages/milkdown-plugin-japanese-novel/mdi-document";
import { getDictAccess } from "@/lib/dict/dict-access";
import { localPreferences } from "@/lib/storage/local-preferences";
import {
  summarizeGenjiVocabulary,
  freqRankDistributionToRows,
  registerDistributionToRows,
} from "@/lib/utils/vocabulary-genji";
import type { WordEntry } from "@/lib/nlp-client/types";
import type { GenjiVocabularySummary } from "@/lib/utils/vocabulary-genji";

/**
 * Cache schema version. Bump whenever the analysis OUTPUT changes so stale
 * on-disk caches are discarded instead of being served verbatim.
 * v2: #1640 strips serializer-escaped `\[\[blank]]` markers — pre-v2 caches
 *     still contain spurious "blank" tokens (#1639).
 */
const CACHE_SCHEMA_VERSION = 2;

/** Cache file schema for word frequency results */
interface WordFrequencyCache {
  /** Schema version; missing/older => cache is stale and re-analyzed. */
  schemaVersion?: number;
  lastModified: number;
  fileSize: number;
  words: WordEntry[];
  totalWords: number;
  uniqueWords: number;
  analyzedAt: number;
}

interface WordFrequencyProps {
  /** エディタのテキストコンテンツ */
  content: string;
  /** 単語をクリックしたときに検索ダイアログを開く */
  onWordSearch?: (word: string) => void;
  /** File path (relative) for VFS-based cache; omit for standalone/no-cache mode */
  filePath?: string;
}

/** Dictionary lookup action map */
const DICTIONARY_ACTIONS: Record<string, (word: string) => { url: string; title: string }> = {
  genji: (word) => ({
    url: `https://dict.illusions.app/results?q=${encodeURIComponent(word)}`,
    title: `${word} - 幻辞`,
  }),
  kotobank: (word) => ({
    url: `https://kotobank.jp/word/${encodeURIComponent(word)}`,
    title: `${word} - コトバンク`,
  }),
  weblio: (word) => ({
    url: `https://www.weblio.jp/content/${encodeURIComponent(word)}`,
    title: `${word} - Weblio`,
  }),
  google: (word) => ({
    url: `https://www.google.com/search?q=${encodeURIComponent(word)}`,
    title: `${word} - Google`,
  }),
};

/**
 * Derive a unique cache path from the full file path.
 * Uses a simple djb2-style hash of the full path so that files with the
 * same basename in different directories never share a cache entry.
 */
function hashPath(filePath: string): string {
  let hash = 5381;
  for (let i = 0; i < filePath.length; i++) {
    hash = ((hash << 5) + hash) ^ filePath.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return hash.toString(16).padStart(8, "0");
}

function getCachePath(filePath: string): string {
  const basename = filePath.split("/").pop() ?? filePath;
  const hash = hashPath(filePath);
  return `.illusions/word_count/${basename}_${hash}.json`;
}

function WordFrequency({ content, onWordSearch, filePath }: WordFrequencyProps) {
  const [words, setWords] = useState<WordEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAnalyzedContent, setLastAnalyzedContent] = useState<string>("");
  const [cacheTimestamp, setCacheTimestamp] = useState<number>(0);

  // Genji vocabulary enrichment state
  const [genjiSummary, setGenjiSummary] = useState<GenjiVocabularySummary | null>(null);
  const [genjiLoading, setGenjiLoading] = useState(false);
  /** Set to true when the Genji DB is ready (health.state === "ready"). False means graceful hide. */
  const [genjiReady, setGenjiReady] = useState(false);
  /**
   * 「辞書データからの分析」セクションの開閉。既定は展開。
   * 開閉状態は localPreferences に永続化し、次回以降も記憶する（#1639）。
   * 幻辞セクションは genjiReady（client-only async）後にのみ描画されるため、
   * lazy initializer による localStorage 読み取りで hydration mismatch は起きない。
   */
  const [genjiExpanded, setGenjiExpanded] = useState<boolean>(() =>
    localPreferences.getGenjiAnalysisExpanded(),
  );

  /** Generation counter — incremented on each analysis start; stale async results are discarded (#1078) */
  const genRef = useRef(0);

  const contextMenu = useContextMenu();

  const openDictionary = useCallback((word: string, url: string, title: string) => {
    if (window.electronAPI?.openDictionaryPopup) {
      window.electronAPI.openDictionaryPopup(url, title);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, []);

  const handleDictionaryAction = useCallback(
    (action: string, word: string) => {
      const lookup = DICTIONARY_ACTIONS[action];
      if (lookup) {
        const { url, title } = lookup(word);
        openDictionary(word, url, title);
      }
    },
    [openDictionary],
  );

  const [contextWord, setContextWord] = useState("");

  const handleWordContextMenu = useCallback(
    async (e: React.MouseEvent, word: string) => {
      const items = [
        { label: `Googleで調べる`, action: "google" },
        { label: `幻辞.comで調べる`, action: "genji" },
        { label: `コトバンクで調べる`, action: "kotobank" },
        { label: `weblio.jpで調べる`, action: "weblio" },
      ];

      setContextWord(word);

      // In Electron, show() returns the selected action; in Web, returns null
      const action = await contextMenu.show(e, items);
      if (action) {
        handleDictionaryAction(action, word);
      }
    },
    [contextMenu, handleDictionaryAction],
  );

  // コンテンツを解析 (with VFS cache support)
  const analyzeContent = async (force = false) => {
    if (!force && content === lastAnalyzedContent && words.length > 0) {
      return;
    }

    if (!content.trim()) {
      setWords([]);
      setLastAnalyzedContent("");
      setCacheTimestamp(0);
      return;
    }

    // Increment generation counter so any previously in-flight analysis is considered stale (#1078)
    const myGen = ++genRef.current;

    setIsLoading(true);
    setError(null);

    try {
      const vfs = getProjectFileService();
      const canCache = !!filePath && vfs.isRootOpen();

      // Try reading cache
      if (canCache && !force) {
        try {
          const cachePath = getCachePath(filePath);
          const cacheText = await vfs.readFile(cachePath);
          const cache = JSON.parse(cacheText) as WordFrequencyCache;
          const meta = await vfs.getFileMetadata(filePath);

          if (
            cache.schemaVersion === CACHE_SCHEMA_VERSION &&
            cache.lastModified === meta.lastModified &&
            cache.fileSize === meta.size
          ) {
            // Discard stale result if a newer analysis was started (#1078)
            if (genRef.current !== myGen) return;
            setWords(cache.words);
            setLastAnalyzedContent(content);
            setCacheTimestamp(cache.analyzedAt);
            setIsLoading(false);
            return;
          }
        } catch {
          // Cache miss or read error — proceed to NLP analysis
        }
      }

      // Run NLP analysis
      const nlpClient = getNlpClient();
      // #1449: NLP input is always the analysis derivation ([[blank]] markers removed)
      const wordEntries = await nlpClient.analyzeWordFrequency(
        MdiDocument.fromRawText(content).toAnalysisText(),
      );

      // Discard stale result if a newer analysis was started (#1078)
      if (genRef.current !== myGen) return;

      setWords(wordEntries);
      setLastAnalyzedContent(content);
      const now = Date.now();
      setCacheTimestamp(now);

      // Write cache
      if (canCache) {
        try {
          const meta = await vfs.getFileMetadata(filePath);
          const totalWords = wordEntries.reduce((sum, w) => sum + w.count, 0);
          const cacheData: WordFrequencyCache = {
            schemaVersion: CACHE_SCHEMA_VERSION,
            lastModified: meta.lastModified,
            fileSize: meta.size,
            words: wordEntries,
            totalWords,
            uniqueWords: wordEntries.length,
            analyzedAt: now,
          };
          const cachePath = getCachePath(filePath);
          // writeFile creates parent directories as needed
          await vfs.writeFile(cachePath, JSON.stringify(cacheData, null, 2));
        } catch (err) {
          console.warn("[WordFrequency] Failed to write cache:", err);
        }
      }
    } catch (err) {
      console.error("[WordFrequency] Analysis error:", err);
      setError("解析に失敗しました");
    } finally {
      // Only clear the loading spinner for the current generation (#1078)
      if (genRef.current === myGen) {
        setIsLoading(false);
      }
    }
  };

  // 初回マウント時と content 変更時に自動解析
  useEffect(() => {
    if (content !== lastAnalyzedContent) {
      const timer = setTimeout(() => {
        analyzeContent();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [content, lastAnalyzedContent]);

  // Genji vocabulary enrichment — run after words list changes
  useEffect(() => {
    if (words.length === 0) {
      setGenjiSummary(null);
      return;
    }

    let cancelled = false;

    const runGenji = async (): Promise<void> => {
      const access = getDictAccess();
      const health = await access.getHealth();

      if (cancelled) return;

      // Graceful degradation: only enrich when the local Electron DB is ready.
      // Web-fallback and not-installed states skip bulk lookup.
      if (health.state !== "ready") {
        setGenjiReady(false);
        setGenjiSummary(null);
        return;
      }

      setGenjiReady(true);
      setGenjiLoading(true);

      try {
        const wordStrings = words.map((w) => w.word);
        const lookupMap = await access.lookupBatch(wordStrings);
        if (cancelled) return;
        const summary = summarizeGenjiVocabulary(wordStrings, lookupMap);
        setGenjiSummary(summary);
      } catch (err) {
        console.warn("[WordFrequency] Genji enrichment failed:", err);
        // Non-critical — swallow and hide the section
        setGenjiSummary(null);
      } finally {
        if (!cancelled) setGenjiLoading(false);
      }
    };

    void runGenji();

    return () => {
      cancelled = true;
    };
  }, [words]);

  const stats = useMemo(() => {
    const totalWords = words.reduce((sum, w) => sum + w.count, 0);
    const uniqueWords = words.length;
    return { totalWords, uniqueWords };
  }, [words]);

  const getPosColorHex = (pos: string): string | null => {
    switch (pos) {
      case "名詞":
        return "#4A90E2";
      case "動詞":
        return "#27AE60";
      case "形容詞":
        return "#00A8FF";
      case "副詞":
        return "#E84393";
      case "助詞":
        return "#8E44AD";
      case "助動詞":
        return "#E67E22";
      case "接続詞":
        return "#D4A017";
      case "連体詞":
        return "#6C5CE7";
      case "感動詞":
        return "#FF7675";
      case "記号":
        return "#7F8C8D";
      default:
        return null;
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
              isLoading && "animate-spin",
            )}
            title="再解析"
          >
            <RefreshCw className="w-4 h-4 text-foreground-tertiary" />
          </button>
        </div>

        {/* 統計サマリー */}
        <div className="flex gap-4 mt-2 text-xs text-foreground-tertiary">
          <span>
            総語数: <span className="text-foreground">{stats.totalWords}</span>
          </span>
          <span>
            異なり語数: <span className="text-foreground">{stats.uniqueWords}</span>
          </span>
        </div>
      </div>

      {/* エラー表示 */}
      {error && <div className="px-3 py-2 text-xs text-red-500 bg-red-500/10">{error}</div>}

      {/* ローディング */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <LoaderCircle className="w-5 h-5 text-foreground-tertiary animate-spin" />
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
                className="px-3 py-1.5 hover:bg-hover flex items-center justify-between gap-2 cursor-pointer"
                onClick={() => onWordSearch?.(entry.word)}
                onContextMenu={(e) => handleWordContextMenu(e, entry.word)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm text-foreground truncate">{entry.word}</span>
                    {entry.reading && (
                      <span className="text-xs text-foreground-tertiary">({entry.reading})</span>
                    )}
                  </div>
                  <span
                    className="text-xs"
                    style={{ color: getPosColorHex(entry.pos) ?? undefined }}
                  >
                    {entry.pos}
                  </span>
                </div>
                <div className="flex-shrink-0 flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{entry.count}</span>
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

      {/* 辞書データからの分析セクション — Genji DB が ready のときのみ表示。デフォルト折り畳み（#1639） */}
      {genjiReady && (
        <div className="flex-shrink-0 border-t border-border">
          <div className="px-3 py-2">
            <button
              type="button"
              onClick={() =>
                setGenjiExpanded((v) => {
                  const next = !v;
                  localPreferences.setGenjiAnalysisExpanded(next);
                  return next;
                })
              }
              aria-expanded={genjiExpanded}
              className="w-full flex items-center justify-between gap-1.5 -mx-1 px-1 py-0.5 rounded hover:bg-hover transition-colors"
            >
              <span className="flex items-center gap-1 min-w-0">
                {genjiExpanded ? (
                  <ChevronDown className="w-3 h-3 text-foreground-tertiary flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-foreground-tertiary flex-shrink-0" />
                )}
                <h3 className="text-xs font-medium text-foreground-secondary truncate">
                  辞書データからの分析
                </h3>
              </span>
              {genjiLoading && (
                <LoaderCircle className="w-3 h-3 text-foreground-tertiary animate-spin flex-shrink-0" />
              )}
            </button>

            {genjiExpanded && genjiSummary !== null && !genjiLoading && (
              <div className="mt-1.5">
                {/* 頻度ランク分布 */}
                <div className="mb-2">
                  <p className="text-xs text-foreground-tertiary mb-1">頻度ランク分布</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {freqRankDistributionToRows(genjiSummary.freqRankDistribution).map((row) => (
                      <span key={row.label} className="text-xs text-foreground-tertiary">
                        {row.label}:{" "}
                        <span className="text-foreground font-medium">{row.count}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* レジスター分布（文体ラベルが1種類以上あるときのみ） */}
                {Object.keys(genjiSummary.registerDistribution).length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs text-foreground-tertiary mb-1">文体</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                      {registerDistributionToRows(genjiSummary.registerDistribution).map((row) => (
                        <span key={row.label} className="text-xs text-foreground-tertiary">
                          {row.label}:{" "}
                          <span className="text-foreground font-medium">{row.count}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 辞書にない語彙数 */}
                <p className="text-xs text-foreground-tertiary">
                  辞書にない語彙数:{" "}
                  <span className="text-foreground font-medium">
                    {genjiSummary.unknownWordCount}
                  </span>
                  <span className="ml-1 text-foreground-tertiary">
                    （固有名詞・造語・誤記の候補）
                  </span>
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 幻辞未導入時の案内（Electron のみ、web では非表示） */}
      {!genjiReady && typeof window !== "undefined" && window.electronAPI !== undefined && (
        <div className="flex-shrink-0 border-t border-border px-3 py-2">
          <p className="text-xs text-foreground-tertiary">
            辞書データをダウンロードすると、頻度ランク・文体・辞書にない語彙の分析が使えます。
          </p>
        </div>
      )}

      {/* Web context menu */}
      {contextMenu.menu && (
        <ContextMenu
          menu={contextMenu.menu}
          onAction={(action) => handleDictionaryAction(action, contextWord)}
          onClose={contextMenu.close}
        />
      )}
    </div>
  );
}

export default memo(WordFrequency);

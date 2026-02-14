"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import GlassDialog from "./GlassDialog";
import { getNlpClient } from "@/lib/nlp-client/nlp-client";

import type { Token } from "@/lib/nlp-client/types";

/** A segment of text with its editable reading */
interface RubySegment {
  surface: string;
  reading: string;
  /** Whether this segment needs Ruby (has kanji) */
  hasKanji: boolean;
}

interface RubyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedText: string;
  onApply: (rubyMarkup: string) => void;
}

/** Regex to detect kanji characters */
const KANJI_REGEX = /[\u4e00-\u9faf\u3400-\u4dbf]/;

/** Convert katakana to hiragana */
function katakanaToHiragana(str: string): string {
  return str.replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

/** Group consecutive tokens into Ruby segments */
function tokensToSegments(tokens: Token[]): RubySegment[] {
  const segments: RubySegment[] = [];

  for (const token of tokens) {
    const hasKanji = KANJI_REGEX.test(token.surface);
    const reading = token.reading
      ? katakanaToHiragana(token.reading)
      : token.surface;

    segments.push({
      surface: token.surface,
      reading,
      hasKanji,
    });
  }

  return segments;
}

/** Build MDI ruby syntax from segments */
function buildRubyMarkup(segments: RubySegment[]): string {
  return segments
    .map((seg) => {
      if (seg.hasKanji && seg.reading && seg.reading !== seg.surface) {
        return `{${seg.surface}|${seg.reading}}`;
      }
      return seg.surface;
    })
    .join("");
}

export default function RubyDialog({
  isOpen,
  onClose,
  selectedText,
  onApply,
}: RubyDialogProps) {
  const [segments, setSegments] = useState<RubySegment[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Analyze text when dialog opens
  useEffect(() => {
    if (!isOpen || !selectedText) return;

    let cancelled = false;

    const analyze = async () => {
      setIsAnalyzing(true);
      setError(null);

      try {
        const nlpClient = getNlpClient();
        const tokens = await nlpClient.tokenizeParagraph(selectedText);

        if (cancelled) return;

        setSegments(tokensToSegments(tokens));
      } catch (err) {
        if (cancelled) return;
        setError(
          `形態素解析に失敗しました: ${err instanceof Error ? err.message : String(err)}`
        );
      } finally {
        if (!cancelled) setIsAnalyzing(false);
      }
    };

    void analyze();

    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedText]);

  const handleReadingChange = useCallback(
    (index: number, newReading: string) => {
      setSegments((prev) =>
        prev.map((seg, i) =>
          i === index ? { ...seg, reading: newReading } : seg
        )
      );
    },
    []
  );

  const handleApply = useCallback(() => {
    const markup = buildRubyMarkup(segments);
    onApply(markup);
    onClose();
  }, [segments, onApply, onClose]);

  const preview = buildRubyMarkup(segments);

  return (
    <GlassDialog
      isOpen={isOpen}
      onBackdropClick={onClose}
      ariaLabel="ルビ設定"
      panelClassName="mx-4 w-full max-w-lg p-6"
    >
      <h2 className="text-lg font-semibold text-foreground mb-4">
        ルビ設定
      </h2>

      {/* Loading state */}
      {isAnalyzing && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-accent mr-2" />
          <span className="text-sm text-foreground-secondary">
            解析中...
          </span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-error/10 border border-error/30 rounded-lg p-3 mb-4">
          <p className="text-xs text-error">{error}</p>
        </div>
      )}

      {/* Segment editing */}
      {!isAnalyzing && !error && segments.length > 0 && (
        <>
          <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
            {segments.map((seg, i) => (
              <div
                key={`${seg.surface}-${i}`}
                className="flex items-center gap-3 p-2 bg-background-secondary rounded-lg border border-border"
              >
                <span className="text-sm font-medium text-foreground min-w-[3rem] text-center">
                  {seg.surface}
                </span>
                {seg.hasKanji ? (
                  <input
                    type="text"
                    value={seg.reading}
                    onChange={(e) => handleReadingChange(i, e.target.value)}
                    className="flex-1 text-sm px-2 py-1 border border-border-secondary rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    placeholder="読み"
                  />
                ) : (
                  <span className="flex-1 text-sm text-foreground-tertiary px-2 py-1">
                    {seg.reading}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Preview */}
          <div className="bg-background-secondary rounded-lg p-3 border border-border mb-4">
            <p className="text-xs font-medium text-foreground-tertiary uppercase tracking-wide mb-2">
              プレビュー
            </p>
            <p className="text-sm text-foreground font-serif leading-relaxed">
              {segments.map((seg, i) =>
                seg.hasKanji && seg.reading && seg.reading !== seg.surface ? (
                  <ruby key={i}>
                    {seg.surface}
                    <rt>{seg.reading}</rt>
                  </ruby>
                ) : (
                  <span key={i}>{seg.surface}</span>
                )
              )}
            </p>
            <p className="text-xs text-foreground-tertiary mt-2 font-mono break-all">
              {preview}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-foreground-secondary hover:text-foreground rounded transition-colors"
            >
              キャンセル
            </button>
            <button
              onClick={handleApply}
              className="px-4 py-2 text-sm font-medium bg-accent text-white rounded hover:bg-accent-hover transition-colors"
            >
              適用
            </button>
          </div>
        </>
      )}

      {/* No segments (empty selection) */}
      {!isAnalyzing && !error && segments.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-sm text-foreground-tertiary">
            テキストを選択してからルビ設定を開いてください
          </p>
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 text-sm font-medium text-foreground-secondary hover:text-foreground rounded transition-colors"
          >
            閉じる
          </button>
        </div>
      )}
    </GlassDialog>
  );
}

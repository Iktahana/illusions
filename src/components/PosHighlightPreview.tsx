"use client";

import { DEFAULT_POS_COLORS } from "@/lib/editor-page/pos-highlight-colors";

interface PosHighlightPreviewProps {
  posHighlightColors: Record<string, string>;
  posHighlightEnabled: boolean;
}

export default function PosHighlightPreview({
  posHighlightColors,
  posHighlightEnabled,
}: PosHighlightPreviewProps): React.ReactElement {
  const color = (key: string) => posHighlightColors[key] || DEFAULT_POS_COLORS[key] || "#000000";

  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-border bg-background-secondary p-6 text-center text-sm text-foreground-secondary">
      {posHighlightEnabled ? (
        <p className="leading-8">
          <span style={{ color: color("名詞") }}>東京</span>で
          <span style={{ color: color("動詞") }}>歩く</span>
          <span style={{ color: color("助詞") }}>と</span>
          <span style={{ color: color("形容詞") }}>静かな</span>
          <span style={{ color: color("名詞") }}>夜</span>に
          <span style={{ color: color("副詞") }}>そっと</span>
          <span style={{ color: color("助動詞") }}>なった</span>。
        </p>
      ) : (
        "品詞ハイライトを有効にすると、ここに色分けプレビューが表示されます。"
      )}
    </div>
  );
}

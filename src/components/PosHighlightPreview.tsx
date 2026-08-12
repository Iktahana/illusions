"use client";

interface PosHighlightPreviewProps {
  posHighlightColors: Record<string, string>;
  posHighlightEnabled: boolean;
}

/** UI placeholder until POS highlighting is reintroduced as a new-core extension. */
export default function PosHighlightPreview({
  posHighlightEnabled,
}: PosHighlightPreviewProps): React.ReactElement {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-border bg-background-secondary p-6 text-center text-sm text-foreground-secondary">
      {posHighlightEnabled
        ? "品詞ハイライトは新エディターへの再接続準備中です。"
        : "品詞ハイライトを有効にすると、今後ここにプレビューが表示されます。"}
    </div>
  );
}

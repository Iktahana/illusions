"use client";

import { useEffect, useState } from "react";

import { useEditorInteraction } from "@/lib/editor-interaction/context";
import type { EditorCommand } from "@/lib/editor-interaction";

const buttons: Array<{ label: string; command: EditorCommand; text: string }> = [
  { label: "太字", command: { id: "format.strong" }, text: "B" },
  { label: "斜体", command: { id: "format.emphasis" }, text: "I" },
  { label: "取り消し線", command: { id: "format.strikethrough" }, text: "S" },
  { label: "見出し1", command: { id: "format.heading", level: 1 }, text: "H1" },
  { label: "見出し2", command: { id: "format.heading", level: 2 }, text: "H2" },
  { label: "見出し3", command: { id: "format.heading", level: 3 }, text: "H3" },
  { label: "引用", command: { id: "format.blockquote" }, text: "❝" },
  { label: "箇条書き", command: { id: "format.bulletList" }, text: "•" },
  { label: "番号付きリスト", command: { id: "format.orderedList" }, text: "1." },
  { label: "インラインコード", command: { id: "format.inlineCode" }, text: "<>" },
  { label: "書式をクリア", command: { id: "format.clear" }, text: "×" },
];

export default function BubbleMenu({
  isVertical,
}: {
  isVertical: boolean;
}): React.ReactElement | null {
  const { handle, snapshot } = useEditorInteraction();
  const selection = snapshot.selection;
  const [dismissedRevision, setDismissedRevision] = useState<number | null>(null);
  useEffect(() => {
    setDismissedRevision(null);
  }, [selection.revision]);
  if (
    !snapshot.ready ||
    snapshot.documentFormat === "plain-text" ||
    snapshot.composing ||
    selection.kind === "none" ||
    selection.kind === "caret" ||
    dismissedRevision === selection.revision ||
    !selection.rect
  )
    return null;
  const maxLeft = typeof window === "undefined" ? selection.rect.left : window.innerWidth - 320;
  const maxTop = typeof window === "undefined" ? selection.rect.top : window.innerHeight - 44;
  const style: React.CSSProperties = isVertical
    ? {
        left: Math.max(8, Math.min(maxLeft, selection.rect.left - 48)),
        top: Math.max(8, Math.min(maxTop, selection.rect.top)),
      }
    : {
        left: Math.max(8, Math.min(maxLeft, selection.rect.left)),
        top: Math.max(8, Math.min(maxTop, selection.rect.top - 44)),
      };
  return (
    <div
      role="toolbar"
      aria-label="選択範囲の書式"
      data-testid="editor-bubble-menu"
      className="fixed z-50 flex max-w-[calc(100vw-16px)] gap-0.5 overflow-x-auto rounded-md border border-border bg-background-secondary p-1 shadow-lg"
      style={style}
      onMouseDown={(event) => event.preventDefault()}
    >
      {buttons.map(({ label, command, text }) => (
        <button
          key={label}
          type="button"
          aria-label={label}
          className="rounded px-2 py-1 text-xs hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          onClick={() => {
            const result = handle.execute(command, selection.token);
            if (result.status !== "executed") setDismissedRevision(selection.revision);
          }}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

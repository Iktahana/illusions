"use client";

import { useState, type RefObject } from "react";

import { useEditorInteraction } from "@/lib/editor-interaction/context";
import type { EditorCommand, EditorInteractionHandle, SelectionToken } from "@/lib/editor-interaction";

const buttons: Array<{ label: string; command: EditorCommand; text: string }> = [
  { label: "ルビを設定", command: { id: "format.ruby", mode: "apply", segments: [] }, text: "ル" },
  { label: "縦中横を切替", command: { id: "format.tcy" }, text: "TCY" },
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
  editorSurface,
  onEditorCommand,
}: {
  isVertical: boolean;
  editorSurface?: RefObject<HTMLElement | null>;
  onEditorCommand?: (
    handle: EditorInteractionHandle,
    command: EditorCommand,
    token?: SelectionToken,
  ) => void;
}): React.ReactElement | null {
  const { handle, snapshot } = useEditorInteraction();
  const selection = snapshot.selection;
  const [dismissedRevision, setDismissedRevision] = useState<number | null>(null);
  // A dismissed revision stops matching automatically when the interaction
  // store publishes a newer selection. Avoid resetting state from an effect:
  // selection geometry updates can be frequent and must not create a render
  // feedback loop in the active editor pane.
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
  const viewport =
    editorSurface?.current?.querySelector<HTMLElement>("[data-milkdown-root]") ??
    editorSurface?.current;
  const viewportRect = viewport?.getBoundingClientRect() ?? {
    left: 0,
    top: 0,
    right: typeof window === "undefined" ? selection.rect.right : window.innerWidth,
    bottom: typeof window === "undefined" ? selection.rect.bottom : window.innerHeight,
  };
  const menuWidth = Math.min(480, Math.max(160, viewportRect.right - viewportRect.left - 16));
  const minLeft = viewportRect.left + 8;
  const minTop = viewportRect.top + 8;
  const maxLeft = Math.max(minLeft, viewportRect.right - menuWidth - 8);
  const maxTop = Math.max(minTop, viewportRect.bottom - 44);
  const style: React.CSSProperties = isVertical
    ? {
        left: Math.max(minLeft, Math.min(maxLeft, selection.rect.right + 8)),
        top: Math.max(minTop, Math.min(maxTop, selection.rect.top)),
      }
    : {
        left: Math.max(minLeft, Math.min(maxLeft, selection.rect.left)),
        top: Math.max(minTop, Math.min(maxTop, selection.rect.top - 44)),
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
      {buttons
        .filter(
          ({ command }) =>
            snapshot.availability[command.id] &&
            (command.id !== "format.ruby" || Boolean(onEditorCommand)),
        )
        .map(({ label, command, text }) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            className="rounded px-2 py-1 text-xs hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            onClick={() => {
              if (onEditorCommand) {
                onEditorCommand(handle, command, selection.token);
                return;
              }
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

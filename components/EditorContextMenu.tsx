"use client";

import * as ContextMenu from "@radix-ui/react-context-menu";
import { Scissors, Copy, ClipboardPaste, Search, CheckSquare, Languages, ALargeSmall, Globe, BookOpen, AlertCircle } from "lucide-react";
import type { ReactNode, MouseEvent } from "react";

import type { LintIssue } from "@/lib/linting";

export type ContextMenuAction =
  | "cut"
  | "copy"
  | "paste"
  | "paste-plaintext"
  | "find"
  | "select-all"
  | "ruby"
  | "tcy"
  | "google-search"
  | "dictionary"
  | "show-lint-hint";

interface EditorContextMenuProps {
  children: ReactNode;
  onAction: (action: ContextMenuAction) => void;
  hasSelection?: boolean;
  lintIssueAtCursor?: LintIssue | null;
  onContextMenuOpen?: (e: MouseEvent) => void;
}

interface MenuItemProps {
  icon: ReactNode;
  label: string;
  shortcut: string;
  onClick: () => void;
  disabled?: boolean;
}

function MenuItem({ icon, label, shortcut, onClick, disabled = false }: MenuItemProps) {
  return (
    <ContextMenu.Item
      className="group relative flex items-center gap-3 px-3 py-2 text-sm outline-none cursor-pointer select-none data-[disabled]:opacity-50 data-[disabled]:pointer-events-none data-[highlighted]:bg-white/5 rounded"
      onClick={onClick}
      disabled={disabled}
    >
      <span className="w-4 h-4 flex items-center justify-center text-foreground-tertiary group-data-[highlighted]:text-foreground-secondary">
        {icon}
      </span>
      <span className="flex-1 text-foreground-secondary group-data-[highlighted]:text-foreground">
        {label}
      </span>
      <span className="text-xs text-foreground-tertiary group-data-[highlighted]:text-foreground-secondary">
        {shortcut}
      </span>
    </ContextMenu.Item>
  );
}

function Separator() {
  return <ContextMenu.Separator className="h-px bg-border my-1" />;
}

export default function EditorContextMenu({
  children,
  onAction,
  hasSelection = false,
  lintIssueAtCursor,
  onContextMenuOpen,
}: EditorContextMenuProps) {
  // Detect platform for keyboard shortcuts
  const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
  const cmdKey = isMac ? "⌘" : "Ctrl+";

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger onContextMenu={onContextMenuOpen} asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className="min-w-[220px] bg-background/95 backdrop-blur-xl border border-border rounded-lg shadow-2xl p-1.5 will-change-[opacity,transform] data-[side=top]:animate-slideDownAndFade data-[side=right]:animate-slideLeftAndFade data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade"
        >
          {/* 校正提示 */}
          {lintIssueAtCursor && (
            <>
              <MenuItem
                icon={<AlertCircle className="w-4 h-4" />}
                label="校正提示を表示"
                shortcut=""
                onClick={() => onAction("show-lint-hint")}
              />
              <Separator />
            </>
          )}

          {/* 編集 */}
          <MenuItem
            icon={<Scissors className="w-4 h-4" />}
            label="切り取り"
            shortcut={`${cmdKey}X`}
            onClick={() => onAction("cut")}
            disabled={!hasSelection}
          />
          <MenuItem
            icon={<Copy className="w-4 h-4" />}
            label="コピー"
            shortcut={`${cmdKey}C`}
            onClick={() => onAction("copy")}
            disabled={!hasSelection}
          />
          <MenuItem
            icon={<ClipboardPaste className="w-4 h-4" />}
            label="貼り付け"
            shortcut={`${cmdKey}V`}
            onClick={() => onAction("paste")}
          />
          <MenuItem
            icon={<ClipboardPaste className="w-4 h-4" />}
            label="プレーンテキストとして貼り付け"
            shortcut={`Shift+${cmdKey}V`}
            onClick={() => onAction("paste-plaintext")}
          />

          <Separator />

          {/* 書式 */}
          <MenuItem
            icon={<Languages className="w-4 h-4" />}
            label="ルビ"
            shortcut={`Shift+${cmdKey}R`}
            onClick={() => onAction("ruby")}
            disabled={!hasSelection}
          />
          <MenuItem
            icon={<ALargeSmall className="w-4 h-4" />}
            label="縦中横"
            shortcut={`Shift+${cmdKey}T`}
            onClick={() => onAction("tcy")}
            disabled={!hasSelection}
          />

          <Separator />

          {/* 検索・調べる */}
          <MenuItem
            icon={<Search className="w-4 h-4" />}
            label="検索"
            shortcut={`${cmdKey}F`}
            onClick={() => onAction("find")}
          />
          <MenuItem
            icon={<Globe className="w-4 h-4" />}
            label="Googleで検索"
            shortcut=""
            onClick={() => onAction("google-search")}
            disabled={!hasSelection}
          />
          <MenuItem
            icon={<BookOpen className="w-4 h-4" />}
            label="辞書で調べる"
            shortcut=""
            onClick={() => onAction("dictionary")}
            disabled={!hasSelection}
          />

          <Separator />

          <MenuItem
            icon={<CheckSquare className="w-4 h-4" />}
            label="すべて選択"
            shortcut={`${cmdKey}A`}
            onClick={() => onAction("select-all")}
          />
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

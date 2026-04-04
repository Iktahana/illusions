"use client";

import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  Scissors,
  Copy,
  ClipboardPaste,
  Search,
  CheckSquare,
  Languages,
  ALargeSmall,
  Globe,
  BookOpen,
  AlertCircle,
  EyeOff,
  Play,
} from "lucide-react";
import type { ReactNode, MouseEvent } from "react";

import type { LintIssue } from "@/lib/linting";
import { useKeymap } from "@/contexts/KeymapContext";
import { isMacOS } from "@/lib/utils/runtime-env";
import { formatBinding } from "@/lib/keymap/keymap-utils";

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
  | "show-lint-hint"
  | "ignore-correction"
  | "ignore-correction-all"
  | "start-speech";

interface EditorContextMenuProps {
  children: ReactNode;
  onAction: (action: ContextMenuAction) => void;
  hasSelection?: boolean;
  lintIssueAtCursor?: LintIssue | null;
  onContextMenuOpen?: (e: MouseEvent) => void;
  /** Whether MDI extensions (ruby / tcy) are enabled for this document */
  mdiExtensionsEnabled?: boolean;
  /** Pass the speech callback when speech feature is available; omit to hide the menu item */
  onStartSpeech?: (() => void) | null;
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
  mdiExtensionsEnabled = true,
  onStartSpeech,
}: EditorContextMenuProps) {
  const { effectiveBindings } = useKeymap();

  // Detect platform for native shortcuts (cut/copy/paste are browser built-ins not in registry)
  const isMac = isMacOS();
  const cmdKey = isMac ? "⌘" : "Ctrl+";

  // "辞書で調べる" is only available in Electron via IPC
  const isElectron =
    typeof window !== "undefined" &&
    Boolean((window as Window & { electronAPI?: unknown }).electronAPI);

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger onContextMenu={onContextMenuOpen} asChild>
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="min-w-[220px] bg-background/95 backdrop-blur-xl border border-border rounded-lg shadow-2xl p-1.5 will-change-[opacity,transform] data-[side=top]:animate-slideDownAndFade data-[side=right]:animate-slideLeftAndFade data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade">
          {/* 校正提示 */}
          {lintIssueAtCursor && (
            <>
              <MenuItem
                icon={<AlertCircle className="w-4 h-4" />}
                label="校正提示を表示"
                shortcut=""
                onClick={() => onAction("show-lint-hint")}
              />
              <MenuItem
                icon={<EyeOff className="w-4 h-4" />}
                label="この指摘を無視"
                shortcut=""
                onClick={() => onAction("ignore-correction")}
              />
              <MenuItem
                icon={<EyeOff className="w-4 h-4" />}
                label="同じ指摘をすべて無視"
                shortcut=""
                onClick={() => onAction("ignore-correction-all")}
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
            shortcut={formatBinding(effectiveBindings["edit.pasteAsPlaintext"])}
            onClick={() => onAction("paste-plaintext")}
          />

          <Separator />

          {/* 書式: ruby / tcy are MDI-extension features; hide when disabled or nothing is selected */}
          {mdiExtensionsEnabled && hasSelection && (
            <>
              <MenuItem
                icon={<Languages className="w-4 h-4" />}
                label="ルビ"
                shortcut={formatBinding(effectiveBindings["format.ruby"])}
                onClick={() => onAction("ruby")}
              />
              <MenuItem
                icon={<ALargeSmall className="w-4 h-4" />}
                label="縦中横"
                shortcut={formatBinding(effectiveBindings["format.tcy"])}
                onClick={() => onAction("tcy")}
              />
              <Separator />
            </>
          )}

          {/* 検索・調べる */}
          <MenuItem
            icon={<Search className="w-4 h-4" />}
            label="検索"
            shortcut={formatBinding(effectiveBindings["nav.search"])}
            onClick={() => onAction("find")}
          />
          <MenuItem
            icon={<Globe className="w-4 h-4" />}
            label="Googleで検索"
            shortcut=""
            onClick={() => onAction("google-search")}
            disabled={!hasSelection}
          />
          {/* 辞書で調べる: Electron only — uses native IPC */}
          {isElectron && (
            <MenuItem
              icon={<BookOpen className="w-4 h-4" />}
              label="辞書で調べる"
              shortcut=""
              onClick={() => onAction("dictionary")}
              disabled={!hasSelection}
            />
          )}

          {/* 読み上げ: hide when speech feature is not available */}
          {onStartSpeech != null && (
            <>
              <Separator />
              <MenuItem
                icon={<Play className="w-4 h-4" />}
                label="読み上げ開始"
                shortcut=""
                onClick={() => onAction("start-speech")}
              />
            </>
          )}

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

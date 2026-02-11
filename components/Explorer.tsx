"use client";

import { ReactNode, useMemo, useState, useEffect, useRef, useCallback } from "react";
import {
  FolderTree,
  Settings,
  Palette,
  ChevronRight,
  FileText,
  RefreshCw,
  X,
  Check,
  Folder,
  File,
  ChevronDown,
  FilePlus,
  FolderPlus,
} from "lucide-react";
import clsx from "clsx";
import { parseMarkdownChapters, getChaptersFromDOM, type Chapter } from "@/lib/utils";
import { useContextMenu } from "@/lib/use-context-menu";
import ContextMenu from "@/components/ContextMenu";
import GlassDialog from "@/components/GlassDialog";
import {
  FEATURED_JAPANESE_FONTS,
  ALL_JAPANESE_FONTS,
  LOCAL_SYSTEM_FONTS,
  ensureLocalFontAvailable,
  isElectronRuntime,
  loadGoogleFont,
  type FontInfo,
  type SystemFontInfo,
} from "@/lib/fonts";
type Tab = "chapters" | "settings" | "style";

const formattingMarkers = ["**", "__", "~~", "*", "_", "`", "["];

function renderFormattedTitle(title: string): ReactNode {
  let nodeCounter = 0;
  const nextKey = () => `formatted-${nodeCounter++}`;

  const findNextSpecial = (segment: string, start: number) => {
    let next = segment.length;

    formattingMarkers.forEach((marker) => {
      const pos = segment.indexOf(marker, start + 1);
      if (pos !== -1 && pos < next) {
        next = pos;
      }
    });

    return next;
  };

  const parseSegment = (segment: string): ReactNode[] => {
    const nodes: ReactNode[] = [];
    let idx = 0;

    while (idx < segment.length) {
      if (segment.startsWith("**", idx)) {
        const end = segment.indexOf("**", idx + 2);
        if (end > idx + 1) {
          nodes.push(
            <strong key={nextKey()} className="font-semibold text-foreground">
              {parseSegment(segment.slice(idx + 2, end))}
            </strong>
          );
          idx = end + 2;
          continue;
        }
      }

      if (segment.startsWith("__", idx)) {
        const end = segment.indexOf("__", idx + 2);
        if (end > idx + 1) {
          nodes.push(
            <strong key={nextKey()} className="font-semibold text-foreground">
              {parseSegment(segment.slice(idx + 2, end))}
            </strong>
          );
          idx = end + 2;
          continue;
        }
      }

      if (segment.startsWith("~~", idx)) {
        const end = segment.indexOf("~~", idx + 2);
        if (end > idx + 1) {
          nodes.push(
            <span key={nextKey()} className="text-foreground-tertiary line-through">
              {parseSegment(segment.slice(idx + 2, end))}
            </span>
          );
          idx = end + 2;
          continue;
        }
      }

      if (segment.startsWith("*", idx) && !segment.startsWith("**", idx)) {
        const end = segment.indexOf("*", idx + 1);
        if (end > idx) {
          nodes.push(
            <em key={nextKey()} className="italic text-foreground-secondary">
              {parseSegment(segment.slice(idx + 1, end))}
            </em>
          );
          idx = end + 1;
          continue;
        }
      }

      if (segment.startsWith("_", idx) && !segment.startsWith("__", idx)) {
        const end = segment.indexOf("_", idx + 1);
        if (end > idx) {
          nodes.push(
            <em key={nextKey()} className="italic text-foreground-secondary">
              {parseSegment(segment.slice(idx + 1, end))}
            </em>
          );
          idx = end + 1;
          continue;
        }
      }

      if (segment.startsWith("`", idx)) {
        const end = segment.indexOf("`", idx + 1);
        if (end > idx) {
          nodes.push(
            <code key={nextKey()} className="font-mono text-xs text-foreground-secondary bg-background-tertiary px-1 rounded-sm">
              {segment.slice(idx + 1, end)}
            </code>
          );
          idx = end + 1;
          continue;
        }
      }

      if (segment[idx] === "[") {
        const closeBracket = segment.indexOf("]", idx + 1);
        const openParen = closeBracket === -1 ? -1 : segment.indexOf("(", closeBracket + 1);
        const closeParen = openParen === -1 ? -1 : segment.indexOf(")", openParen + 1);

        if (closeBracket > idx && openParen === closeBracket + 1 && closeParen > openParen) {
          const label = segment.slice(idx + 1, closeBracket);
          nodes.push(
            <strong key={nextKey()} className="font-semibold text-foreground">
              {parseSegment(label)}
            </strong>
          );
          idx = closeParen + 1;
          continue;
        }
      }

      const nextSpecial = findNextSpecial(segment, idx);
      const plainText = segment.slice(idx, nextSpecial);
      if (plainText) {
        nodes.push(
          <span key={nextKey()}>{plainText}</span>
        );
      }
      idx = nextSpecial;
    }

    return nodes;
  };

  return <>{parseSegment(title)}</>;
}

interface ExplorerProps {
  className?: string;
  content?: string;
  onChapterClick?: (anchorId: string) => void;
  onInsertText?: (text: string) => void;
  // 表示設定
  fontScale?: number;
  onFontScaleChange?: (scale: number) => void;
  lineHeight?: number;
  onLineHeightChange?: (height: number) => void;
  paragraphSpacing?: number;
  onParagraphSpacingChange?: (spacing: number) => void;
  textIndent?: number;
  onTextIndentChange?: (indent: number) => void;
  fontFamily?: string;
  onFontFamilyChange?: (family: string) => void;
  charsPerLine?: number;
  onCharsPerLineChange?: (chars: number) => void;
  showParagraphNumbers?: boolean;
  onShowParagraphNumbersChange?: (show: boolean) => void;
}

export default function Explorer({ 
  className, 
  content = "", 
  onChapterClick, 
  onInsertText,
  fontScale = 100,
  onFontScaleChange,
  lineHeight = 1.8,
  onLineHeightChange,
  paragraphSpacing = 0.5,
  onParagraphSpacingChange,
  textIndent = 1,
  onTextIndentChange,
  fontFamily = 'Noto Serif JP',
  onFontFamilyChange,
  charsPerLine = 40,
  onCharsPerLineChange,
  showParagraphNumbers = false,
  onShowParagraphNumbersChange,
}: ExplorerProps) {
  const [activeTab, setActiveTab] = useState<Tab>("chapters");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedTab = window.localStorage.getItem("illusions:leftTab");
    if (savedTab === "chapters" || savedTab === "settings" || savedTab === "style") {
      setActiveTab(savedTab as Tab);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("illusions:leftTab", activeTab);
  }, [activeTab]);

  return (
    <aside className={clsx("h-full bg-background border-r border-border flex flex-col", className)}>
      {/* タブ */}
      <div className="h-12 border-b border-border flex items-center">
        <button
          onClick={() => setActiveTab("chapters")}
          className={clsx(
            "flex-1 h-full flex items-center justify-center gap-2 text-sm transition-colors",
            activeTab === "chapters"
              ? "text-foreground border-b-2 border-accent"
              : "text-foreground hover:text-foreground"
          )}
          title="章"
        >
          <FolderTree className="w-4 h-4" />
          <span className="hidden sm:inline">章</span>
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={clsx(
            "flex-1 h-full flex items-center justify-center gap-2 text-sm transition-colors",
            activeTab === "settings"
              ? "text-foreground border-b-2 border-accent"
              : "text-foreground hover:text-foreground"
          )}
          title="設定"
        >
          <Settings className="w-4 h-4" />
          <span className="hidden sm:inline">設定</span>
        </button>
        <button
          onClick={() => setActiveTab("style")}
          className={clsx(
            "flex-1 h-full flex items-center justify-center gap-2 text-sm transition-colors",
            activeTab === "style"
              ? "text-foreground border-b-2 border-accent"
              : "text-foreground hover:text-foreground"
          )}
          title="段落"
        >
          <Palette className="w-4 h-4" />
          <span className="hidden sm:inline">段落</span>
        </button>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "chapters" && <div className="p-4"><ChaptersPanel content={content} onChapterClick={onChapterClick} onInsertText={onInsertText} /></div>}
        {activeTab === "settings" && <div className="p-4"><SettingsPanel /></div>}
        {activeTab === "style" && (
          <div className="p-4">
            <StylePanel 
              fontScale={fontScale}
              onFontScaleChange={onFontScaleChange}
              lineHeight={lineHeight}
              onLineHeightChange={onLineHeightChange}
              paragraphSpacing={paragraphSpacing}
              onParagraphSpacingChange={onParagraphSpacingChange}
              textIndent={textIndent}
              onTextIndentChange={onTextIndentChange}
              fontFamily={fontFamily}
              onFontFamilyChange={onFontFamilyChange}
              charsPerLine={charsPerLine}
              onCharsPerLineChange={onCharsPerLineChange}
              showParagraphNumbers={showParagraphNumbers}
              onShowParagraphNumbersChange={onShowParagraphNumbersChange}
            />
          </div>
        )}
      </div>
    </aside>
  );
}

interface FileTreeEntry {
  name: string;
  kind: "file" | "directory";
  children?: FileTreeEntry[];
}

/** State for inline editing (rename / new file / new folder) */
interface EditingEntry {
  /** Parent directory path (e.g. "/" or "/subdir") */
  parentPath: string;
  /** What kind of editing operation */
  kind: "rename" | "new-file" | "new-folder";
  /** Current file/folder name (used for rename; empty for new) */
  currentName: string;
}

export function FilesPanel({ projectName }: { projectName?: string }) {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(["/"]));
  const [tree, setTree] = useState<FileTreeEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [editing, setEditing] = useState<EditingEntry | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const { menu, show: showContextMenu, close: closeContextMenu } = useContextMenu();
  /** Track the right-clicked entry for Web context menu callback */
  const contextTargetRef = useRef<{ path: string; kind: "file" | "directory" } | null>(null);

  const refresh = useCallback(() => setRefreshToken(v => v + 1), []);

  const loadDirectory = useCallback(async (dirPath: string): Promise<FileTreeEntry[]> => {
    const { getVFS } = await import("@/lib/vfs");
    const vfs = getVFS();
    const entries = await vfs.listDirectory(dirPath);

    const sorted = [...entries]
      .filter((e) => !e.name.startsWith("."))
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    const result: FileTreeEntry[] = [];
    for (const entry of sorted) {
      if (entry.kind === "directory") {
        const childPath = dirPath ? `${dirPath}/${entry.name}` : entry.name;
        const fullKey = `/${childPath}`;
        let children: FileTreeEntry[] | undefined;
        if (expandedDirs.has(fullKey)) {
          try {
            children = await loadDirectory(childPath);
          } catch {
            children = [];
          }
        }
        result.push({ name: entry.name, kind: "directory", children });
      } else {
        result.push({ name: entry.name, kind: "file" });
      }
    }
    return result;
  }, [expandedDirs]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { getVFS } = await import("@/lib/vfs");
        const vfs = getVFS();
        if (!vfs.isRootOpen()) {
          setTree(null);
          return;
        }
        setLoading(true);
        const entries = await loadDirectory("");
        if (!cancelled) setTree(entries);
      } catch (error) {
        console.error("ファイルツリーの読み込みに失敗しました:", error);
        if (!cancelled) setTree(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [loadDirectory, refreshToken]);

  // Auto-focus the inline edit input when editing starts
  useEffect(() => {
    if (editing && editInputRef.current) {
      const input = editInputRef.current;
      input.focus();
      if (editing.kind === "rename") {
        // Select filename without extension
        const dotIndex = editing.currentName.lastIndexOf(".");
        if (dotIndex > 0) {
          input.setSelectionRange(0, dotIndex);
        } else {
          input.select();
        }
      } else {
        input.select();
      }
    }
  }, [editing]);

  const toggleDir = useCallback((path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
    setRefreshToken(v => v + 1);
  }, []);

  // ---- File operations ----

  /** Convert tree path (e.g. "/subdir/file.txt") to VFS-relative path (e.g. "subdir/file.txt") */
  const toVFSPath = (treePath: string): string => treePath.replace(/^\//, "");

  const handleDelete = useCallback(async (fullPath: string, kind: "file" | "directory") => {
    const name = fullPath.split("/").pop() || fullPath;
    const msg = kind === "directory"
      ? `フォルダ「${name}」を削除しますか？中のファイルもすべて削除されます。`
      : `ファイル「${name}」を削除しますか？`;
    if (!window.confirm(msg)) return;

    try {
      const { getVFS } = await import("@/lib/vfs");
      const vfs = getVFS();
      if (kind === "directory") {
        const dirHandle = await vfs.getDirectoryHandle(toVFSPath(fullPath));
        // Delete all entries recursively
        const entries = await vfs.listDirectory(toVFSPath(fullPath));
        for (const entry of entries) {
          await dirHandle.removeEntry(entry.name, { recursive: true });
        }
        // Delete the directory itself via parent
        const parentPath = fullPath.substring(0, fullPath.lastIndexOf("/")) || "/";
        const dirName = fullPath.split("/").pop()!;
        const parentHandle = await vfs.getDirectoryHandle(toVFSPath(parentPath));
        await parentHandle.removeEntry(dirName, { recursive: true });
      } else {
        await vfs.deleteFile(toVFSPath(fullPath));
      }
      refresh();
    } catch (error) {
      console.error("削除に失敗しました:", error);
    }
  }, [refresh]);

  const handleRename = useCallback(async (fullPath: string, newName: string) => {
    if (!newName.trim()) return;
    const oldName = fullPath.split("/").pop()!;
    if (newName === oldName) { setEditing(null); return; }

    const parentPath = fullPath.substring(0, fullPath.lastIndexOf("/")) || "/";
    const newFullPath = parentPath === "/" ? `/${newName}` : `${parentPath}/${newName}`;

    try {
      const { getVFS } = await import("@/lib/vfs");
      const vfs = getVFS();
      await vfs.rename(toVFSPath(fullPath), toVFSPath(newFullPath));
      setEditing(null);
      refresh();
    } catch (error) {
      console.error("名前の変更に失敗しました:", error);
    }
  }, [refresh]);

  const handleDuplicate = useCallback(async (fullPath: string) => {
    try {
      const { getVFS } = await import("@/lib/vfs");
      const vfs = getVFS();
      const content = await vfs.readFile(toVFSPath(fullPath));

      const name = fullPath.split("/").pop()!;
      const parentPath = fullPath.substring(0, fullPath.lastIndexOf("/")) || "/";
      const dotIndex = name.lastIndexOf(".");
      const baseName = dotIndex > 0 ? name.substring(0, dotIndex) : name;
      const ext = dotIndex > 0 ? name.substring(dotIndex) : "";
      const copyName = `${baseName} (コピー)${ext}`;
      const copyPath = parentPath === "/" ? `/${copyName}` : `${parentPath}/${copyName}`;

      await vfs.writeFile(toVFSPath(copyPath), content);
      refresh();
    } catch (error) {
      console.error("複製に失敗しました:", error);
    }
  }, [refresh]);

  const handleDownload = useCallback(async (fullPath: string) => {
    try {
      const { getVFS } = await import("@/lib/vfs");
      const vfs = getVFS();
      const content = await vfs.readFile(toVFSPath(fullPath));
      const name = fullPath.split("/").pop()!;

      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("パソコンに保存に失敗しました:", error);
    }
  }, []);

  const handleNewFile = useCallback(async (parentPath: string, name: string) => {
    if (!name.trim()) { setEditing(null); return; }
    const filePath = parentPath === "/" ? `/${name}` : `${parentPath}/${name}`;
    try {
      const { getVFS } = await import("@/lib/vfs");
      const vfs = getVFS();
      await vfs.writeFile(toVFSPath(filePath), "");
      setEditing(null);
      refresh();
    } catch (error) {
      console.error("ファイル作成に失敗しました:", error);
    }
  }, [refresh]);

  const handleNewFolder = useCallback(async (parentPath: string, name: string) => {
    if (!name.trim()) { setEditing(null); return; }
    const dirPath = parentPath === "/" ? `/${name}` : `${parentPath}/${name}`;
    try {
      const { getVFS } = await import("@/lib/vfs");
      const vfs = getVFS();
      const parentHandle = await vfs.getDirectoryHandle(toVFSPath(parentPath));
      await parentHandle.getDirectoryHandle(name, { create: true });
      setEditing(null);
      // Expand the parent so new folder is visible
      setExpandedDirs(prev => {
        const next = new Set(prev);
        next.add(parentPath);
        next.add(dirPath);
        return next;
      });
      refresh();
    } catch (error) {
      console.error("フォルダ作成に失敗しました:", error);
    }
  }, [refresh]);

  const startNewFile = useCallback((parentPath: string) => {
    // Ensure parent is expanded
    setExpandedDirs(prev => { const next = new Set(prev); next.add(parentPath); return next; });
    setEditing({ parentPath, kind: "new-file", currentName: "" });
    refresh();
  }, [refresh]);

  const startNewFolder = useCallback((parentPath: string) => {
    setExpandedDirs(prev => { const next = new Set(prev); next.add(parentPath); return next; });
    setEditing({ parentPath, kind: "new-folder", currentName: "" });
    refresh();
  }, [refresh]);

  const handleContextAction = useCallback(async (action: string, fullPath: string, kind: "file" | "directory") => {
    switch (action) {
      case "delete":
        await handleDelete(fullPath, kind);
        break;
      case "rename": {
        const parentPath = fullPath.substring(0, fullPath.lastIndexOf("/")) || "/";
        const name = fullPath.split("/").pop()!;
        setEditing({ parentPath, kind: "rename", currentName: name });
        break;
      }
      case "duplicate":
        await handleDuplicate(fullPath);
        break;
      case "download":
        await handleDownload(fullPath);
        break;
      case "new-file":
        startNewFile(fullPath);
        break;
      case "new-folder":
        startNewFolder(fullPath);
        break;
    }
  }, [handleDelete, handleDuplicate, handleDownload, startNewFile, startNewFolder]);

  const handleEditSubmit = useCallback(async (value: string) => {
    if (!editing) return;
    switch (editing.kind) {
      case "rename": {
        const fullPath = editing.parentPath === "/"
          ? `/${editing.currentName}`
          : `${editing.parentPath}/${editing.currentName}`;
        await handleRename(fullPath, value);
        break;
      }
      case "new-file":
        await handleNewFile(editing.parentPath, value);
        break;
      case "new-folder":
        await handleNewFolder(editing.parentPath, value);
        break;
    }
  }, [editing, handleRename, handleNewFile, handleNewFolder]);

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleEditSubmit(e.currentTarget.value);
    } else if (e.key === "Escape") {
      setEditing(null);
    }
  }, [handleEditSubmit]);

  // ---- Inline edit input component ----
  const renderEditInput = (defaultValue: string) => (
    <input
      ref={editInputRef}
      defaultValue={defaultValue}
      className="flex-1 min-w-0 px-1 py-0.5 text-sm bg-background border border-accent rounded outline-none text-foreground"
      onKeyDown={handleEditKeyDown}
      onBlur={() => setEditing(null)}
    />
  );

  // ---- Context menu handlers ----
  const onFileContextMenu = useCallback(async (e: React.MouseEvent, fullPath: string) => {
    contextTargetRef.current = { path: fullPath, kind: "file" };
    const items = [
      { label: "名前の変更", action: "rename" },
      { label: "複製", action: "duplicate" },
      { label: "削除", action: "delete" },
      { label: "パソコンに保存", action: "download" },
    ];
    const result = await showContextMenu(e, items);
    if (result) {
      void handleContextAction(result, fullPath, "file");
    }
  }, [showContextMenu, handleContextAction]);

  const onFolderContextMenu = useCallback(async (e: React.MouseEvent, fullPath: string) => {
    contextTargetRef.current = { path: fullPath, kind: "directory" };
    const items = [
      { label: "名前の変更", action: "rename" },
      { label: "新規ファイル", action: "new-file" },
      { label: "新規フォルダ", action: "new-folder" },
      { label: "削除", action: "delete" },
    ];
    const result = await showContextMenu(e, items);
    if (result) {
      void handleContextAction(result, fullPath, "directory");
    }
  }, [showContextMenu, handleContextAction]);

  // ---- Render tree entries ----
  const renderEntries = (entries: FileTreeEntry[], parentPath: string, level: number) => {
    const rows: React.ReactNode[] = [];

    for (const entry of entries) {
      const fullPath = parentPath === "/" ? `/${entry.name}` : `${parentPath}/${entry.name}`;

      // Check if this entry is being renamed
      const isRenaming = editing?.kind === "rename"
        && editing.parentPath === parentPath
        && editing.currentName === entry.name;

      if (entry.kind === "file") {
        rows.push(
          <div
            key={fullPath}
            className="flex items-center gap-1.5 px-2 py-1 text-sm text-foreground-secondary hover:bg-hover rounded cursor-pointer"
            style={{ paddingLeft: `${level * 16 + 8}px` }}
            onContextMenu={(e) => { void onFileContextMenu(e, fullPath); }}
          >
            <div className="w-4 shrink-0" />
            <File className="w-4 h-4 shrink-0" />
            {isRenaming
              ? renderEditInput(entry.name)
              : <span className="truncate">{entry.name}</span>
            }
          </div>
        );
      } else {
        const isExpanded = expandedDirs.has(fullPath);
        rows.push(
          <div key={fullPath}>
            <div
              onClick={() => toggleDir(fullPath)}
              onContextMenu={(e) => { void onFolderContextMenu(e, fullPath); }}
              className="group flex items-center gap-1.5 px-2 py-1 text-sm text-foreground hover:bg-hover rounded cursor-pointer"
              style={{ paddingLeft: `${level * 16 + 8}px` }}
            >
              <ChevronDown
                className={clsx(
                  "w-4 h-4 shrink-0 transition-transform",
                  !isExpanded && "-rotate-90"
                )}
              />
              <Folder className="w-4 h-4 shrink-0 text-accent" />
              {isRenaming
                ? renderEditInput(entry.name)
                : <span className="truncate font-medium flex-1">{entry.name}</span>
              }
              {/* Inline hover buttons (VS Code style) */}
              {!isRenaming && (
                <span className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    className="p-0.5 hover:bg-hover rounded"
                    title="新規ファイル"
                    onClick={(e) => { e.stopPropagation(); startNewFile(fullPath); }}
                  >
                    <FilePlus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    className="p-0.5 hover:bg-hover rounded"
                    title="新規フォルダ"
                    onClick={(e) => { e.stopPropagation(); startNewFolder(fullPath); }}
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                  </button>
                </span>
              )}
            </div>
            {isExpanded && entry.children && (
              <div>{renderEntries(entry.children, fullPath, level + 1)}</div>
            )}
            {/* New file/folder input row inside this directory */}
            {isExpanded && editing && editing.parentPath === fullPath && (editing.kind === "new-file" || editing.kind === "new-folder") && (
              <div
                className="flex items-center gap-1.5 px-2 py-1 text-sm"
                style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
              >
                <div className="w-4 shrink-0" />
                {editing.kind === "new-file"
                  ? <File className="w-4 h-4 shrink-0" />
                  : <Folder className="w-4 h-4 shrink-0 text-accent" />
                }
                {renderEditInput("")}
              </div>
            )}
          </div>
        );
      }
    }
    return rows;
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-foreground">ファイル</h3>
        <button
          className="p-1 text-foreground-tertiary hover:text-foreground hover:bg-hover rounded transition-colors"
          title="更新"
          onClick={refresh}
        >
          <RefreshCw className={clsx("w-4 h-4", loading && "animate-spin")} />
        </button>
      </div>

      {tree === null && !loading && (
        <p className="text-xs text-foreground-tertiary px-2">プロジェクトが開かれていません</p>
      )}

      {tree !== null && (
        <div>
          {/* Root directory header */}
          <div
            onClick={() => toggleDir("/")}
            onContextMenu={(e) => { void onFolderContextMenu(e, "/"); }}
            className="group flex items-center gap-1.5 px-2 py-1 text-sm text-foreground hover:bg-hover rounded cursor-pointer"
          >
            <ChevronDown
              className={clsx(
                "w-4 h-4 shrink-0 transition-transform",
                !expandedDirs.has("/") && "-rotate-90"
              )}
            />
            <Folder className="w-4 h-4 shrink-0 text-accent" />
            <span className="truncate font-medium flex-1">{projectName || "プロジェクト"}</span>
            {/* Root inline buttons */}
            <span className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                className="p-0.5 hover:bg-hover rounded"
                title="新規ファイル"
                onClick={(e) => { e.stopPropagation(); startNewFile("/"); }}
              >
                <FilePlus className="w-3.5 h-3.5" />
              </button>
              <button
                className="p-0.5 hover:bg-hover rounded"
                title="新規フォルダ"
                onClick={(e) => { e.stopPropagation(); startNewFolder("/"); }}
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
            </span>
          </div>
          {expandedDirs.has("/") && (
            <>
              {renderEntries(tree, "/", 1)}
              {/* New file/folder input at root level */}
              {editing && editing.parentPath === "/" && (editing.kind === "new-file" || editing.kind === "new-folder") && (
                <div
                  className="flex items-center gap-1.5 px-2 py-1 text-sm"
                  style={{ paddingLeft: `${1 * 16 + 8}px` }}
                >
                  <div className="w-4 shrink-0" />
                  {editing.kind === "new-file"
                    ? <File className="w-4 h-4 shrink-0" />
                    : <Folder className="w-4 h-4 shrink-0 text-accent" />
                  }
                  {renderEditInput("")}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Web context menu overlay */}
      {menu && (
        <ContextMenu
          menu={menu}
          onAction={(action) => {
            const target = contextTargetRef.current;
            if (target) {
              void handleContextAction(action, target.path, target.kind);
            }
          }}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}

function ChaptersPanel({ content, onChapterClick, onInsertText }: { content: string; onChapterClick?: (anchorId: string) => void; onInsertText?: (text: string) => void }) {
  const [refreshToken, setRefreshToken] = useState(0);

  // 10秒ごとに自動更新
  useEffect(() => {
    const timer = setInterval(() => setRefreshToken((v) => v + 1), 10000);
    return () => clearInterval(timer);
  }, []);

  // まずDOMから章情報を取得し（より確実）、なければMarkdown解析にフォールバック
  const chapters = useMemo(() => {
    const domChapters = getChaptersFromDOM();
    // DOM側でアンカーIDが取れるなら、それを優先して使う
    if (domChapters.length > 0 && domChapters.some(ch => ch.anchorId)) {
      return domChapters;
    }
    // それ以外はMarkdownを解析して章情報を作る
    return parseMarkdownChapters(content);
  }, [content, refreshToken]);
  const [showSyntaxHelp, setShowSyntaxHelp] = useState(false);

  return (
    <div className="space-y-2 relative">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-foreground-secondary">目次</h3>
        <button
          type="button"
          className="p-1 hover:bg-hover rounded"
          title="目次を更新"
          aria-label="目次を更新"
          onClick={() => {
            setShowSyntaxHelp(false);
            setRefreshToken((v) => v + 1);
          }}
        >
          <RefreshCw className="w-4 h-4 text-foreground-secondary" />
        </button>
      </div>
      
      {/* 章リスト */}
      <div className="space-y-1">
        {chapters.length > 0 ? (
            chapters.map((chapter, index) => (
            <ChapterItem
              key={index}
              chapter={chapter}
              isActive={index === 0}
              onClick={() => {
                if (chapter.anchorId) {
                  onChapterClick?.(chapter.anchorId);
                }
              }}
            />
          ))

        ) : (
          <div className="text-xs text-foreground-tertiary px-2 py-2">
            コンテンツに見出しがありません
          </div>
        )}
      </div>
      
      <button 
        onClick={() => setShowSyntaxHelp(true)}
        className="w-full mt-4 py-2 text-sm text-foreground-secondary hover:text-foreground hover:bg-hover rounded border border-dashed border-border-secondary"
      >
        + 新しい章を追加
      </button>

      {/* Markdown 記法ヘルプ */}
      {showSyntaxHelp && (
        <MarkdownSyntaxPanel 
          onClose={() => setShowSyntaxHelp(false)}
          onInsertText={(text) => {
            onInsertText?.(text);
            setShowSyntaxHelp(false);
          }}
        />
      )}
    </div>
  );
}

function MarkdownSyntaxPanel({ onClose, onInsertText }: { onClose: () => void; onInsertText: (text: string) => void }) {
  const syntaxExamples = [
    { syntax: "# 見出し", description: "レベル1の見出し", example: "# 第一章", fontSize: "2em" },
    { syntax: "## 見出し", description: "レベル2の見出し", example: "## 第一節", fontSize: "1.5em" },
    { syntax: "### 見出し", description: "レベル3の見出し", example: "### シーン1", fontSize: "1.17em" },
    { syntax: "#### 見出し", description: "レベル4の見出し", example: "#### セクション", fontSize: "1em" },
    { syntax: "##### 見出し", description: "レベル5の見出し", example: "##### サブセクション", fontSize: "0.83em" },
    { syntax: "###### 見出し", description: "レベル6の見出し", example: "###### 詳細", fontSize: "0.67em" },
  ];

  return (
    <GlassDialog
      isOpen={true}
      onBackdropClick={onClose}
      panelClassName="w-[500px] max-h-[80vh] overflow-hidden flex flex-col p-0"
    >
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background-secondary/50 rounded-t-xl">
        <h3 className="text-sm font-semibold text-foreground">
          章の見出しを追加
        </h3>
        <button
          onClick={onClose}
          className="p-1 text-foreground-tertiary hover:text-foreground-secondary hover:bg-hover rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-2">
          {syntaxExamples.map((item, index) => (
            <button
              key={index}
              onClick={() => onInsertText(item.example)}
              className="w-full p-3 bg-background-secondary rounded-lg border border-border hover:border-accent hover:bg-active transition-colors text-left"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <code className="text-sm font-mono text-accent bg-background px-2 py-0.5 rounded">
                  {item.syntax}
                </code>
                <span className="text-xs text-foreground-tertiary">{item.description}</span>
              </div>
              <div className="text-foreground-secondary mt-2 pl-2 border-l-2 border-border-secondary">
                {item.example.split('\n').map((line, i) => (
                  <div
                    key={i}
                    className="font-mono"
                    style={{ fontSize: item.fontSize }}
                  >
                    {line}
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>

        {/* 補足 */}
        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <h4 className="text-xs font-semibold text-blue-800 mb-2">💡 ヒント</h4>
          <ul className="text-xs text-blue-700 space-y-1">
            <li>• 見出しの後には空行が必要です</li>
            <li>• # の数が多いほど、小さな見出しになります</li>
            <li>• 見出しは章の構造を表すのに使います</li>
          </ul>
        </div>
      </div>
    </GlassDialog>
  );
}

function ChapterItem({ 
  chapter, 
  isActive = false,
  onClick
}: { 
  chapter: Chapter; 
  isActive?: boolean;
  onClick?: () => void;
}) {
  const indent = (chapter.level - 1) * 12; // 見出しレベルに応じてインデント
  const href = chapter.anchorId ? `#${chapter.anchorId}` : undefined;
  
  // 見出しレベル（h1〜h6）に応じたフォントサイズ
  // CSS既定: h1=2em, h2=1.5em, h3=1.17em, h4=1em, h5=0.83em, h6=0.67em
  return (
    <a
      href={href}
      onClick={(event) => {
        if (!href) return;
        event.preventDefault();
        onClick?.();
      }}
      className={clsx(
        "flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors",
        isActive
          ? "bg-accent text-accent-foreground"
          : "hover:bg-hover text-foreground"
      )}
      style={{ paddingLeft: `${8 + indent}px` }}
    >
      <FileText className="w-4 h-4 flex-shrink-0" />
      <span className="text-sm flex-1 truncate">{renderFormattedTitle(chapter.title)}</span>
    </a>
  );
}

function SettingsPanel() {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground-secondary mb-2">
          小説タイトル
        </label>
        <input
          type="text"
          placeholder="無題の小説"
          className="w-full px-3 py-2 text-sm border border-border-secondary rounded focus:outline-none focus:ring-2 focus:ring-accent bg-background text-foreground"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-foreground-secondary mb-2">
          著者名
        </label>
        <input
          type="text"
          placeholder="著者名"
          className="w-full px-3 py-2 text-sm border border-border-secondary rounded focus:outline-none focus:ring-2 focus:ring-accent bg-background text-foreground"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-foreground-secondary mb-2">
          あらすじ
        </label>
        <textarea
          placeholder="小説の概要を入力..."
          rows={4}
          className="w-full px-3 py-2 text-sm border border-border-secondary rounded focus:outline-none focus:ring-2 focus:ring-accent resize-none bg-background text-foreground"
        />
      </div>
    </div>
  );
}

function FontSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (font: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isElectron = useMemo(() => isElectronRuntime(), []);
  const platform = useMemo(() => {
    if (typeof navigator === 'undefined') {
      return null;
    }
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('mac')) {
      return 'mac';
    }
    if (ua.includes('win')) {
      return 'windows';
    }
    return null;
  }, []);

  const systemFonts = useMemo(() => {
    if (!isElectron) {
      return [];
    }
    if (!platform) {
      return LOCAL_SYSTEM_FONTS;
    }
    return LOCAL_SYSTEM_FONTS.filter((font: SystemFontInfo) =>
      font.platforms.includes(platform)
    );
  }, [isElectron, platform]);

  const systemFontFamilies = useMemo(
    () => new Set(systemFonts.map((font) => font.family)),
    [systemFonts]
  );

  const selectedFont = useMemo(
    () =>
      systemFonts.find((font) => font.family === value) ||
      ALL_JAPANESE_FONTS.find((font) => font.family === value),
    [systemFonts, value]
  );

  // 外側クリックでドロップダウンを閉じる
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // おすすめフォントを先読み
  useEffect(() => {
    FEATURED_JAPANESE_FONTS.forEach((font: FontInfo) => {
      loadGoogleFont(font.family);
    });
  }, []);

  const handleSelect = (font: string) => {
    onChange(font);
    if (systemFontFamilies.has(font)) {
      void ensureLocalFontAvailable(font);
    } else {
      loadGoogleFont(font);
    }
    setIsOpen(false);
    setSearchTerm('');
  };

  // 検索語でフォントを絞り込む（family と localizedName の両方を対象）
  const filteredFonts = searchTerm
    ? ALL_JAPANESE_FONTS.filter((font: FontInfo) =>
        font.family.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (font.localizedName && font.localizedName.includes(searchTerm))
      )
    : ALL_JAPANESE_FONTS;

  const featuredFiltered = FEATURED_JAPANESE_FONTS.filter((font: FontInfo) =>
    !searchTerm || 
    font.family.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (font.localizedName && font.localizedName.includes(searchTerm))
  );

  const systemFiltered = systemFonts.filter((font: SystemFontInfo) =>
    !searchTerm ||
    font.family.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (font.localizedName && font.localizedName.includes(searchTerm))
  );

  const otherFonts = filteredFonts.filter(
    (font: FontInfo) => !FEATURED_JAPANESE_FONTS.find((f: FontInfo) => f.family === font.family)
  );

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 選択中のフォント */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 text-sm border border-border-secondary rounded focus:outline-none focus:ring-2 focus:ring-accent bg-background text-foreground text-left flex items-center justify-between"
        style={{ fontFamily: `"${value}", serif` }}
      >
        <span>
          {selectedFont?.localizedName || value}
        </span>
        <ChevronRight 
          className={clsx(
            "w-4 h-4 transition-transform",
            isOpen ? "rotate-90" : "rotate-0"
          )}
        />
      </button>

      {/* ドロップダウン */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-background border border-border-secondary rounded-lg shadow-lg max-h-80 overflow-hidden flex flex-col">
          {/* 検索 */}
          <div className="p-2 border-b border-border">
            <input
              type="text"
              placeholder="フォントを検索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-2 py-1 text-sm border border-border-secondary rounded focus:outline-none focus:ring-2 focus:ring-accent bg-background text-foreground"
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* フォント一覧 */}
          <div className="overflow-y-auto">
            {/* システムフォント（Electronのみ） */}
            {systemFiltered.length > 0 && (
              <>
                {!searchTerm && (
                  <div className="px-3 py-1 text-xs font-semibold text-foreground-tertiary bg-background-secondary sticky top-0">
                    ローカル
                  </div>
                )}
                {systemFiltered.map(font => (
                  <button
                    key={font.family}
                    type="button"
                    onClick={() => handleSelect(font.family)}
                    className={clsx(
                      "w-full px-3 py-2 text-sm text-left hover:bg-active flex items-center justify-between transition-colors text-foreground",
                      value === font.family && "bg-accent-light"
                    )}
                    style={{ fontFamily: `"${font.family}", serif` }}
                  >
                    <span>{font.localizedName || font.family}</span>
                    {value === font.family && (
                      <Check className="w-4 h-4 text-accent" />
                    )}
                  </button>
                ))}
              </>
            )}

            {/* おすすめ */}
            {featuredFiltered.length > 0 && (
              <>
                  <div className="px-3 py-1 text-xs font-semibold text-foreground-tertiary bg-background-secondary sticky top-0">
                  おすすめ
                </div>
                {featuredFiltered.map(font => (
                  <button
                    key={font.family}
                    type="button"
                    onClick={() => handleSelect(font.family)}
                    className={clsx(
                      "w-full px-3 py-2 text-sm text-left hover:bg-active flex items-center justify-between transition-colors text-foreground",
                      value === font.family && "bg-accent-light"
                    )}
                    style={{ fontFamily: `"${font.family}", serif` }}
                  >
                    <span>{font.localizedName || font.family}</span>
                    {value === font.family && (
                      <Check className="w-4 h-4 text-accent" />
                    )}
                  </button>
                ))}
              </>
            )}

            {/* そのほか */}
            {otherFonts.length > 0 && (
              <>
                {!searchTerm && (
                <div className="px-3 py-1 text-xs font-semibold text-foreground-tertiary bg-background-secondary sticky top-0">
                    すべてのフォント
                  </div>
                )}
                {otherFonts.map(font => (
                  <button
                    key={font.family}
                    type="button"
                    onClick={() => handleSelect(font.family)}
                    className={clsx(
                      "w-full px-3 py-2 text-sm text-left hover:bg-active flex items-center justify-between transition-colors text-foreground",
                      value === font.family && "bg-accent-light"
                    )}
                    style={{ fontFamily: `"${font.family}", serif` }}
                  >
                    <span>{font.localizedName || font.family}</span>
                    {value === font.family && (
                      <Check className="w-4 h-4 text-accent" />
                    )}
                  </button>
                ))}
              </>
            )}

            {/* 該当なし */}
            {systemFiltered.length === 0 && featuredFiltered.length === 0 && otherFonts.length === 0 && (
              <div className="px-3 py-4 text-sm text-foreground-tertiary text-center">
                フォントが見つかりません
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StylePanel({
  fontScale = 100,
  onFontScaleChange,
  lineHeight = 1.8,
  onLineHeightChange,
  paragraphSpacing = 0.5,
  onParagraphSpacingChange,
  textIndent = 1,
  onTextIndentChange,
  fontFamily = 'Noto Serif JP',
  onFontFamilyChange,
  charsPerLine = 40,
  onCharsPerLineChange,
  showParagraphNumbers = false,
  onShowParagraphNumbersChange,
}: {
  fontScale?: number;
  onFontScaleChange?: (scale: number) => void;
  lineHeight?: number;
  onLineHeightChange?: (height: number) => void;
  paragraphSpacing?: number;
  onParagraphSpacingChange?: (spacing: number) => void;
  textIndent?: number;
  onTextIndentChange?: (indent: number) => void;
  fontFamily?: string;
  onFontFamilyChange?: (family: string) => void;
  charsPerLine?: number;
  onCharsPerLineChange?: (chars: number) => void;
  showParagraphNumbers?: boolean;
  onShowParagraphNumbersChange?: (show: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground-secondary mb-2">
          フォント
        </label>
        <FontSelector
          value={fontFamily}
          onChange={(font) => onFontFamilyChange?.(font)}
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-foreground-secondary mb-2">
          文字サイズ
        </label>
        <input
          type="range"
          min="50"
          max="200"
          step="5"
          value={fontScale}
          onChange={(e) => onFontScaleChange?.(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-foreground-tertiary mt-1">
          <span>50%</span>
          <span>{fontScale}%</span>
          <span>200%</span>
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-foreground-secondary mb-2">
          行間
        </label>
        <input
          type="range"
          min="1.5"
          max="2.5"
          step="0.1"
          value={lineHeight}
          onChange={(e) => onLineHeightChange?.(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-foreground-tertiary mt-1">
          <span>狭い</span>
          <span>{lineHeight.toFixed(1)}</span>
          <span>広い</span>
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-foreground-secondary mb-2">
          段落間
        </label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={paragraphSpacing}
          onChange={(e) => onParagraphSpacingChange?.(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-foreground-tertiary mt-1">
          <span>なし</span>
          <span>{paragraphSpacing.toFixed(1)}em</span>
          <span>広い</span>
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-foreground-secondary mb-2">
          字下げ
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            step="0.5"
            value={textIndent}
            onChange={(e) => onTextIndentChange?.(Number(e.target.value))}
            className="w-20 px-3 py-2 text-sm border border-border-secondary rounded focus:outline-none focus:ring-2 focus:ring-accent bg-background text-foreground"
          />
          <span className="text-sm text-foreground-secondary">字</span>
        </div>
        <p className="text-xs text-foreground-tertiary mt-1">
          段落の先頭にインデントを適用します
        </p>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-foreground-secondary mb-2">
          1行あたりの文字数制限
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            step="1"
            value={charsPerLine}
            onChange={(e) => onCharsPerLineChange?.(Number(e.target.value))}
            className="w-20 px-3 py-2 text-sm border border-border-secondary rounded focus:outline-none focus:ring-2 focus:ring-accent bg-background text-foreground"
          />
          <span className="text-sm text-foreground-secondary">字</span>
        </div>
        <p className="text-xs text-foreground-tertiary mt-1">
          {charsPerLine === 0 
            ? '0に設定すると制限なし'
            : '1行（縦書きの場合は1列）あたりの最大文字数'}
        </p>
      </div>
      
      <div>
        <label className="flex items-center justify-between text-sm font-medium text-foreground-secondary mb-2">
          <span>段落番号</span>
          <button
            onClick={() => onShowParagraphNumbersChange?.(!showParagraphNumbers)}
            className={clsx(
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2",
              showParagraphNumbers ? "bg-accent" : "bg-border-secondary"
            )}
          >
            <span
              className={clsx(
                "inline-block h-4 w-4 transform rounded-full bg-background transition-transform",
                showParagraphNumbers ? "translate-x-6" : "translate-x-1"
              )}
            />
          </button>
        </label>
        <p className="text-xs text-foreground-tertiary mt-1">
          段落の先頭に番号を表示します
        </p>
      </div>
    </div>
  );
}

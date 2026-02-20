"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  RefreshCw,
  Folder,
  File,
  ChevronDown,
  FilePlus,
  FolderPlus,
} from "lucide-react";
import clsx from "clsx";
import { useContextMenu } from "@/lib/use-context-menu";
import ContextMenu from "@/components/ContextMenu";
import { isElectronRenderer } from "@/lib/runtime-env";
import type { FileTreeEntry, EditingEntry } from "./types";

interface FilesPanelProps {
  projectName?: string;
  onFileClick?: (vfsPath: string) => void;
  onFileDoubleClick?: (vfsPath: string) => void;
  onFileMiddleClick?: (vfsPath: string) => void;
}

/** File tree panel for browsing and managing project files */
export function FilesPanel({
  projectName,
  onFileClick,
  onFileDoubleClick,
  onFileMiddleClick,
}: FilesPanelProps) {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(["/"]));
  const [tree, setTree] = useState<FileTreeEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [editing, setEditing] = useState<EditingEntry | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const { menu, show: showContextMenu, close: closeContextMenu } = useContextMenu();
  /** Track the right-clicked entry for Web context menu callback */
  const contextTargetRef = useRef<{ path: string; kind: "file" | "directory" } | null>(null);
  /** Timer for single/double click discrimination on files */
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Drag-and-drop state ----
  const [dragSourcePath, setDragSourcePath] = useState<string | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const dragExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        console.error("Failed to load file tree:", error);
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
      } else if (editing.kind === "new-file" && editing.currentName.startsWith(".")) {
        // Extension pre-filled: place cursor at the start (before the extension)
        input.setSelectionRange(0, 0);
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
      console.error("Failed to delete:", error);
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
      console.error("Failed to rename:", error);
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
      console.error("Failed to duplicate:", error);
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
      console.error("Failed to download:", error);
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
      console.error("Failed to create file:", error);
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
      console.error("Failed to create folder:", error);
    }
  }, [refresh]);

  const startNewFile = useCallback((parentPath: string, defaultExtension?: string) => {
    // Ensure parent is expanded
    setExpandedDirs(prev => { const next = new Set(prev); next.add(parentPath); return next; });
    setEditing({ parentPath, kind: "new-file", currentName: defaultExtension ?? "" });
    refresh();
  }, [refresh]);

  const startNewFolder = useCallback((parentPath: string) => {
    setExpandedDirs(prev => { const next = new Set(prev); next.add(parentPath); return next; });
    setEditing({ parentPath, kind: "new-folder", currentName: "" });
    refresh();
  }, [refresh]);

  // ---- Drag-and-drop helpers ----

  /** For a drop target, return the directory path items should be moved/dropped into */
  const getDropTargetDir = (path: string, kind: "file" | "directory"): string => {
    if (kind === "directory") return path;
    // For files, use the parent directory
    const lastSlash = path.lastIndexOf("/");
    return lastSlash <= 0 ? "/" : path.substring(0, lastSlash);
  };

  /** Check if moving src into destDir would create a circular reference */
  const isCircularMove = (src: string, destDir: string): boolean => {
    // Cannot move a folder into itself or any of its descendants
    return destDir === src || destDir.startsWith(src + "/");
  };

  /** Move an internal VFS item from src to destDir */
  const handleDragMove = useCallback(async (srcPath: string, destDir: string) => {
    const name = srcPath.split("/").pop()!;
    const srcParent = srcPath.substring(0, srcPath.lastIndexOf("/")) || "/";
    // No-op if dropped back into the same parent
    if (srcParent === destDir) return;

    const newPath = destDir === "/" ? `/${name}` : `${destDir}/${name}`;
    try {
      const { getVFS } = await import("@/lib/vfs");
      const vfs = getVFS();
      await vfs.rename(toVFSPath(srcPath), toVFSPath(newPath));
      refresh();
    } catch (error) {
      console.error("Failed to move:", error);
    }
  }, [refresh]);

  /** Import external files dropped from the OS into destDir */
  const handleExternalFileDrop = useCallback(async (files: FileList, destDir: string) => {
    try {
      const { getVFS } = await import("@/lib/vfs");
      const vfs = getVFS();
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const content = await file.text();
          const filePath = destDir === "/" ? `/${file.name}` : `${destDir}/${file.name}`;
          await vfs.writeFile(toVFSPath(filePath), content);
        } catch (err) {
          console.warn("Failed to read external file:", file.name, err);
        }
      }
      refresh();
    } catch (error) {
      console.error("Failed to import external files:", error);
    }
  }, [refresh]);

  // ---- Drag event handlers ----

  const DRAG_MIME = "application/x-illusions-tree-path";

  const handleDragStart = useCallback((e: React.DragEvent, path: string, _kind: "file" | "directory") => {
    e.dataTransfer.setData(DRAG_MIME, path);
    e.dataTransfer.effectAllowed = "move";
    setDragSourcePath(path);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragSourcePath(null);
    setDropTargetPath(null);
    if (dragExpandTimerRef.current) {
      clearTimeout(dragExpandTimerRef.current);
      dragExpandTimerRef.current = null;
    }
  }, []);

  const handleTreeDragOver = useCallback((e: React.DragEvent, path: string, kind: "file" | "directory") => {
    e.preventDefault();
    e.stopPropagation();

    const destDir = getDropTargetDir(path, kind);
    const srcPath = dragSourcePath;

    // Validate drop target
    if (srcPath) {
      if (isCircularMove(srcPath, destDir)) {
        e.dataTransfer.dropEffect = "none";
        setDropTargetPath(null);
        return;
      }
      // No-op: same parent
      const srcParent = srcPath.substring(0, srcPath.lastIndexOf("/")) || "/";
      if (srcParent === destDir) {
        e.dataTransfer.dropEffect = "none";
        setDropTargetPath(null);
        return;
      }
    }

    e.dataTransfer.dropEffect = srcPath ? "move" : "copy";
    setDropTargetPath(destDir);

    // Auto-expand collapsed folder after 500ms hover
    if (kind === "directory" && !expandedDirs.has(path)) {
      if (dragExpandTimerRef.current) clearTimeout(dragExpandTimerRef.current);
      dragExpandTimerRef.current = setTimeout(() => {
        setExpandedDirs(prev => {
          const next = new Set(prev);
          next.add(path);
          return next;
        });
        setRefreshToken(v => v + 1);
        dragExpandTimerRef.current = null;
      }, 500);
    }
  }, [dragSourcePath, expandedDirs]);

  const handleTreeDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDropTargetPath(null);
    if (dragExpandTimerRef.current) {
      clearTimeout(dragExpandTimerRef.current);
      dragExpandTimerRef.current = null;
    }
  }, []);

  const handleTreeDrop = useCallback(async (e: React.DragEvent, path: string, kind: "file" | "directory") => {
    e.preventDefault();
    e.stopPropagation();

    const destDir = getDropTargetDir(path, kind);
    setDropTargetPath(null);
    setDragSourcePath(null);
    if (dragExpandTimerRef.current) {
      clearTimeout(dragExpandTimerRef.current);
      dragExpandTimerRef.current = null;
    }

    const srcPath = e.dataTransfer.getData(DRAG_MIME);
    if (srcPath) {
      // Internal move
      if (isCircularMove(srcPath, destDir)) return;
      await handleDragMove(srcPath, destDir);
    } else if (e.dataTransfer.files.length > 0) {
      // External file drop
      await handleExternalFileDrop(e.dataTransfer.files, destDir);
    }
  }, [handleDragMove, handleExternalFileDrop]);

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
      case "new-file-mdi":
        startNewFile(fullPath, ".mdi");
        break;
      case "new-file-md":
        startNewFile(fullPath, ".md");
        break;
      case "new-file-txt":
        startNewFile(fullPath, ".txt");
        break;
      case "new-folder":
        startNewFolder(fullPath);
        break;
      case "reveal-in-finder":
      case "open-in-finder": {
        try {
          const { getVFS } = await import("@/lib/vfs");
          const vfs = getVFS();
          const rootPath = vfs.getRootPath?.();
          if (rootPath && window.electronAPI?.revealInFileManager) {
            const vfsRelative = toVFSPath(fullPath);
            const absolutePath = vfsRelative
              ? `${rootPath}/${vfsRelative}`
              : rootPath;
            void window.electronAPI.revealInFileManager(absolutePath);
          } else if (rootPath && window.electronAPI?.showInFileManager) {
            const vfsRelative = toVFSPath(fullPath);
            const absolutePath = vfsRelative
              ? `${rootPath}/${vfsRelative}`
              : rootPath;
            void window.electronAPI.showInFileManager(absolutePath);
          }
        } catch (error) {
          console.error("Failed to reveal in Finder:", error);
        }
        break;
      }
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
      ...(isElectronRenderer() ? [
        { label: "", action: "_separator" },
        { label: "Finder で表示", action: "reveal-in-finder" },
      ] : []),
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
      { label: "新規 MDI ファイル", action: "new-file-mdi" },
      { label: "新規 Markdown ファイル", action: "new-file-md" },
      { label: "新規テキストファイル", action: "new-file-txt" },
      { label: "新規フォルダ", action: "new-folder" },
      { label: "", action: "_separator" },
      { label: "削除", action: "delete" },
      ...(isElectronRenderer() ? [
        { label: "", action: "_separator" },
        { label: "Finder で開く", action: "open-in-finder" },
      ] : []),
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
        const vfsFilePath = toVFSPath(fullPath);
        rows.push(
          <div
            key={fullPath}
            draggable={!isRenaming}
            onDragStart={(e) => handleDragStart(e, fullPath, "file")}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleTreeDragOver(e, fullPath, "file")}
            onDragLeave={handleTreeDragLeave}
            onDrop={(e) => { void handleTreeDrop(e, fullPath, "file"); }}
            className={clsx(
              "flex items-center gap-1.5 px-2 py-1 text-sm text-foreground-secondary hover:bg-hover rounded cursor-pointer",
              dragSourcePath === fullPath && "opacity-40"
            )}
            style={{ paddingLeft: `${level * 16 + 8}px` }}
            onClick={() => {
              if (!onFileClick) return;
              // Delay single click to discriminate from double click
              if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
              clickTimerRef.current = setTimeout(() => {
                onFileClick(vfsFilePath);
                clickTimerRef.current = null;
              }, 250);
            }}
            onDoubleClick={() => {
              // Cancel pending single click
              if (clickTimerRef.current) {
                clearTimeout(clickTimerRef.current);
                clickTimerRef.current = null;
              }
              onFileDoubleClick?.(vfsFilePath);
            }}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                onFileMiddleClick?.(vfsFilePath);
              }
            }}
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
        const isFolderDropTarget = dropTargetPath === fullPath && dragSourcePath !== fullPath;
        rows.push(
          <div
            key={fullPath}
            onDragOver={(e) => handleTreeDragOver(e, fullPath, "directory")}
            onDragLeave={handleTreeDragLeave}
            onDrop={(e) => { void handleTreeDrop(e, fullPath, "directory"); }}
          >
            <div
              draggable={!isRenaming}
              onDragStart={(e) => handleDragStart(e, fullPath, "directory")}
              onDragEnd={handleDragEnd}
              onClick={() => toggleDir(fullPath)}
              onContextMenu={(e) => { void onFolderContextMenu(e, fullPath); }}
              className={clsx(
                "group flex items-center gap-1.5 px-2 py-1 text-sm text-foreground hover:bg-hover rounded cursor-pointer",
                dragSourcePath === fullPath && "opacity-40",
                isFolderDropTarget && "bg-accent/15 outline outline-1 outline-accent/50 -outline-offset-1"
              )}
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
                    onClick={(e) => { e.stopPropagation(); startNewFile(fullPath, ".mdi"); }}
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
    <div
      className="space-y-1"
      onDragOver={(e) => { e.preventDefault(); }}
      onDrop={(e) => {
        // Fallback: drops that miss any specific item -> treat as root drop
        e.preventDefault();
        void handleTreeDrop(e, "/", "directory");
      }}
    >
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
            onDragOver={(e) => handleTreeDragOver(e, "/", "directory")}
            onDragLeave={handleTreeDragLeave}
            onDrop={(e) => { void handleTreeDrop(e, "/", "directory"); }}
            className={clsx(
              "group flex items-center gap-1.5 px-2 py-1 text-sm text-foreground hover:bg-hover rounded cursor-pointer",
              dropTargetPath === "/" && dragSourcePath !== "/" && "bg-accent/15 outline outline-1 outline-accent/50 -outline-offset-1"
            )}
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
                onClick={(e) => { e.stopPropagation(); startNewFile("/", ".mdi"); }}
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

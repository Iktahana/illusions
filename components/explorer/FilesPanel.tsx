"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { RefreshCw, Folder, File, ChevronDown, FilePlus, FolderPlus } from "lucide-react";
import clsx from "clsx";
import { useContextMenu } from "@/lib/hooks/use-context-menu";
import ContextMenu from "@/shared/ui/ContextMenu";
import ConfirmDialog from "@/shared/ui/ConfirmDialog";
import { isElectronRenderer, detectOSPlatform } from "@/lib/utils/runtime-env";
import { isTextDroppable } from "@/lib/utils/file-type-guard";
import { notificationManager } from "@/lib/services/notification-manager";
import {
  bucketTelemetryCount,
  normalizeTelemetryFileType,
  trackUsageEvent,
} from "@/lib/analytics/usage-events";
import {
  flattenVisibleRows,
  nextRowPath,
  prevRowPath,
  firstRowPath,
  lastRowPath,
  arrowRight,
  arrowLeft,
} from "./tree-navigation";
import type { FileTreeEntry, EditingEntry } from "./types";
import type { VirtualFileSystem } from "@/lib/vfs/types";
import type { AffectedTab } from "@/lib/tab-manager/tab-path-sync";

/**
 * Check whether a file/directory name already exists inside a VFS parent directory.
 * Uses listDirectory so it works on both Web and Electron VFS implementations.
 * Returns true if an entry with the given name exists.
 */
async function checkFileExists(
  vfs: VirtualFileSystem,
  parentVFSPath: string,
  name: string,
): Promise<boolean> {
  try {
    const entries = await vfs.listDirectory(parentVFSPath);
    return entries.some((e) => e.name === name);
  } catch {
    // If listing fails (e.g. parent dir doesn't exist yet), treat as non-existent
    return false;
  }
}

/** Returns the OS-specific file manager name for context menu labels. */
function getFileManagerName(): string {
  const platform = detectOSPlatform();
  if (platform === "mac") return "Finder";
  if (platform === "windows") return "Explorer";
  return "ファイルマネージャー";
}

interface FilesPanelProps {
  projectName?: string;
  onFileClick?: (vfsPath: string) => void;
  onFileDoubleClick?: (vfsPath: string) => void;
  onFileMiddleClick?: (vfsPath: string) => void;
  /** Increment to trigger a new file creation at root with default name. */
  newFileTrigger?: number;
  /** Increment to force the tree to reload after an external mutation (#1870). */
  refreshTrigger?: number;
  /**
   * Notify the tab manager that a file/folder was renamed/moved (#1868).
   * Paths are VFS-relative (no leading slash), matching `tab.file.path`.
   */
  onFileRenamed?: (oldVfsPath: string, newVfsPath: string) => void;
  /** Notify the tab manager that a file/folder was deleted (#1868). */
  onFileDeleted?: (deletedVfsPath: string) => void;
  /** List open tabs affected by deleting a path, for dirty-confirmation (#1868). */
  findTabsAffectedByDelete?: (deletedVfsPath: string) => AffectedTab[];
}

/** File tree panel for browsing and managing project files */
export function FilesPanel({
  projectName,
  onFileClick,
  onFileDoubleClick,
  onFileMiddleClick,
  newFileTrigger,
  refreshTrigger,
  onFileRenamed,
  onFileDeleted,
  findTabsAffectedByDelete,
}: FilesPanelProps) {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(["/"]));
  const [tree, setTree] = useState<FileTreeEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [editing, setEditing] = useState<EditingEntry | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    path: string;
    kind: "file" | "directory";
    name: string;
    /** Open tabs (#1868) affected by this delete; dirty ones need a warning. */
    affectedTabs: AffectedTab[];
  } | null>(null);
  /** Pending overwrite confirmation: holds the operation to execute after user confirms */
  const [overwriteConfirm, setOverwriteConfirm] = useState<{
    name: string;
    execute: () => Promise<void>;
  } | null>(null);
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

  // ---- Keyboard navigation (WAI-ARIA tree, roving tabindex) ----
  /** Tree path of the row that currently holds the roving tabIndex={0}. */
  const [activeRowPath, setActiveRowPath] = useState<string>("/");
  /** Map of tree path -> row DOM element for programmatic .focus(). */
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const registerRowRef = useCallback((path: string, el: HTMLDivElement | null) => {
    if (el) rowRefs.current.set(path, el);
    else rowRefs.current.delete(path);
  }, []);

  /** Move the roving focus to a row and physically focus its DOM element. */
  const focusRow = useCallback((path: string) => {
    setActiveRowPath(path);
    // Focus after the current render so the target element exists with tabIndex=0.
    requestAnimationFrame(() => {
      rowRefs.current.get(path)?.focus();
    });
  }, []);

  const refresh = useCallback(() => setRefreshToken((v) => v + 1), []);

  // Reload the tree when an external mutation (e.g. inspector rename, #1870)
  // bumps the refresh trigger. Skip the initial mount (token 0/undefined).
  useEffect(() => {
    if (refreshTrigger === undefined || refreshTrigger === 0) return;
    refresh();
  }, [refreshTrigger, refresh]);

  const loadDirectory = useCallback(
    async (dirPath: string): Promise<FileTreeEntry[]> => {
      const { getProjectFileService } = await import("@/lib/services/project-file-service");
      const vfs = getProjectFileService();
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
    },
    [expandedDirs],
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { getProjectFileService } = await import("@/lib/services/project-file-service");
        const vfs = getProjectFileService();
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
    return () => {
      cancelled = true;
    };
  }, [loadDirectory, refreshToken]);

  // Keep the roving-tabindex target valid: if the active row is no longer
  // visible (folder collapsed, file deleted/renamed), fall back to the root row.
  useEffect(() => {
    const rows = flattenVisibleRows(tree, expandedDirs);
    if (rows.length === 0) return;
    if (!rows.some((r) => r.path === activeRowPath)) {
      setActiveRowPath(rows[0].path);
    }
  }, [tree, expandedDirs, activeRowPath]);

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
      } else if (editing.kind === "new-file") {
        const dotIndex = editing.currentName.lastIndexOf(".");
        if (dotIndex > 0) {
          // Name with extension (e.g. "新規ファイル.mdi"): select filename part
          input.setSelectionRange(0, dotIndex);
        } else if (editing.currentName.startsWith(".")) {
          // Extension only (e.g. ".mdi"): place cursor at start
          input.setSelectionRange(0, 0);
        } else {
          input.select();
        }
      } else {
        input.select();
      }
    }
  }, [editing]);

  const toggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
    setRefreshToken((v) => v + 1);
  }, []);

  const expandDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      if (prev.has(path)) return prev;
      const next = new Set(prev);
      next.add(path);
      return next;
    });
    setRefreshToken((v) => v + 1);
  }, []);

  const collapseDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      if (!prev.has(path)) return prev;
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
    setRefreshToken((v) => v + 1);
  }, []);

  // ---- File operations ----

  /** Convert tree path (e.g. "/subdir/file.txt") to VFS-relative path (e.g. "subdir/file.txt") */
  const toVFSPath = (treePath: string): string => treePath.replace(/^\//, "");

  const handleDelete = useCallback(
    (fullPath: string, kind: "file" | "directory") => {
      const name = fullPath.split("/").pop() || fullPath;
      // #1868: detect open tabs (incl. nested files for a folder delete) so the
      // confirmation can warn about unsaved edits before destroying them.
      const affectedTabs = findTabsAffectedByDelete?.(toVFSPath(fullPath)) ?? [];
      setDeleteConfirm({ path: fullPath, kind, name, affectedTabs });
    },
    [findTabsAffectedByDelete],
  );

  const executeDelete = useCallback(
    async (fullPath: string, kind: "file" | "directory", affectedTabs: AffectedTab[] = []) => {
      try {
        const { getProjectFileService } = await import("@/lib/services/project-file-service");
        const vfs = getProjectFileService();
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
        // #1868: detach any open tabs at/under the deleted path so the next
        // save cannot recreate the now-deleted file at its old location.
        onFileDeleted?.(toVFSPath(fullPath));
        trackUsageEvent("project_file_deleted", {
          surface: "explorer",
          target_kind: kind === "directory" ? "folder" : "file",
          dirty_open_tabs_bucket: bucketTelemetryCount(
            affectedTabs.filter((tab) => tab.isDirty).length,
          ),
        });
        refresh();
      } catch (error) {
        console.error("Failed to delete:", error);
      }
    },
    [refresh, onFileDeleted],
  );

  const handleRename = useCallback(
    async (fullPath: string, newName: string) => {
      if (!newName.trim()) return;
      const oldName = fullPath.split("/").pop()!;
      if (newName === oldName) {
        setEditing(null);
        return;
      }

      const parentPath = fullPath.substring(0, fullPath.lastIndexOf("/")) || "/";
      const newFullPath = parentPath === "/" ? `/${newName}` : `${parentPath}/${newName}`;

      try {
        const { getProjectFileService } = await import("@/lib/services/project-file-service");
        const vfs = getProjectFileService();

        const parentVFSPath = toVFSPath(parentPath) || "";
        const exists = await checkFileExists(vfs, parentVFSPath, newName);
        if (exists) {
          setEditing(null);
          setOverwriteConfirm({
            name: newName,
            execute: async () => {
              await vfs.rename(toVFSPath(fullPath), toVFSPath(newFullPath));
              // #1868: keep open tabs in sync with the new path before refresh.
              onFileRenamed?.(toVFSPath(fullPath), toVFSPath(newFullPath));
              trackUsageEvent("project_file_renamed", {
                surface: "explorer",
                target_kind: "file",
                result: "completed",
              });
              refresh();
            },
          });
          return;
        }

        await vfs.rename(toVFSPath(fullPath), toVFSPath(newFullPath));
        // #1868: keep open tabs in sync with the new path before refresh.
        onFileRenamed?.(toVFSPath(fullPath), toVFSPath(newFullPath));
        trackUsageEvent("project_file_renamed", {
          surface: "explorer",
          target_kind: "file",
          result: "completed",
        });
        setEditing(null);
        refresh();
      } catch (error) {
        console.error("Failed to rename:", error);
      }
    },
    [refresh, onFileRenamed],
  );

  const handleDuplicate = useCallback(
    async (fullPath: string) => {
      try {
        const { getProjectFileService } = await import("@/lib/services/project-file-service");
        const vfs = getProjectFileService();
        const content = await vfs.readFile(toVFSPath(fullPath));

        const name = fullPath.split("/").pop()!;
        const parentPath = fullPath.substring(0, fullPath.lastIndexOf("/")) || "/";
        const dotIndex = name.lastIndexOf(".");
        const baseName = dotIndex > 0 ? name.substring(0, dotIndex) : name;
        const ext = dotIndex > 0 ? name.substring(dotIndex) : "";
        const copyName = `${baseName} (コピー)${ext}`;
        const copyPath = parentPath === "/" ? `/${copyName}` : `${parentPath}/${copyName}`;

        const parentVFSPath = toVFSPath(parentPath) || "";
        const exists = await checkFileExists(vfs, parentVFSPath, copyName);
        if (exists) {
          setOverwriteConfirm({
            name: copyName,
            execute: async () => {
              await vfs.writeFile(toVFSPath(copyPath), content);
              trackUsageEvent("project_file_duplicated", {
                surface: "explorer",
                file_type: normalizeTelemetryFileType(ext),
                collision: "confirmed",
              });
              refresh();
            },
          });
          return;
        }

        await vfs.writeFile(toVFSPath(copyPath), content);
        trackUsageEvent("project_file_duplicated", {
          surface: "explorer",
          file_type: normalizeTelemetryFileType(ext),
          collision: "none",
        });
        refresh();
      } catch (error) {
        console.error("Failed to duplicate:", error);
      }
    },
    [refresh],
  );

  const handleDownload = useCallback(async (fullPath: string) => {
    try {
      const { getProjectFileService } = await import("@/lib/services/project-file-service");
      const vfs = getProjectFileService();
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

  const handleNewFile = useCallback(
    async (parentPath: string, name: string) => {
      if (!name.trim()) {
        setEditing(null);
        return;
      }
      // Auto-add .mdi extension if no extension provided
      const hasExtension = /\.\w+$/.test(name);
      const finalName = hasExtension ? name : `${name}.mdi`;
      const filePath = parentPath === "/" ? `/${finalName}` : `${parentPath}/${finalName}`;
      try {
        const { getProjectFileService } = await import("@/lib/services/project-file-service");
        const vfs = getProjectFileService();

        const parentVFSPath = toVFSPath(parentPath) || "";
        const exists = await checkFileExists(vfs, parentVFSPath, finalName);
        if (exists) {
          setEditing(null);
          setOverwriteConfirm({
            name: finalName,
            execute: async () => {
              await vfs.writeFile(toVFSPath(filePath), "");
              trackUsageEvent("project_file_created", {
                surface: "explorer",
                file_type: normalizeTelemetryFileType(finalName.slice(finalName.lastIndexOf("."))),
                collision: "confirmed",
              });
              refresh();
            },
          });
          return;
        }

        await vfs.writeFile(toVFSPath(filePath), "");
        trackUsageEvent("project_file_created", {
          surface: "explorer",
          file_type: normalizeTelemetryFileType(finalName.slice(finalName.lastIndexOf("."))),
          collision: "none",
        });
        setEditing(null);
        refresh();
      } catch (error) {
        console.error("Failed to create file:", error);
      }
    },
    [refresh],
  );

  const handleNewFolder = useCallback(
    async (parentPath: string, name: string) => {
      if (!name.trim()) {
        setEditing(null);
        return;
      }
      const dirPath = parentPath === "/" ? `/${name}` : `${parentPath}/${name}`;
      try {
        const { getProjectFileService } = await import("@/lib/services/project-file-service");
        const vfs = getProjectFileService();
        const parentHandle = await vfs.getDirectoryHandle(toVFSPath(parentPath));
        await parentHandle.getDirectoryHandle(name, { create: true });
        trackUsageEvent("project_folder_created", { surface: "explorer" });
        setEditing(null);
        // Expand the parent so new folder is visible
        setExpandedDirs((prev) => {
          const next = new Set(prev);
          next.add(parentPath);
          next.add(dirPath);
          return next;
        });
        refresh();
      } catch (error) {
        console.error("Failed to create folder:", error);
      }
    },
    [refresh],
  );

  const startNewFile = useCallback(
    (parentPath: string, defaultExtension?: string) => {
      // Ensure parent is expanded
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        next.add(parentPath);
        return next;
      });
      setEditing({ parentPath, kind: "new-file", currentName: defaultExtension ?? "" });
      refresh();
    },
    [refresh],
  );

  // External trigger: create new file at root with default name
  const newFileTriggerRef = useRef(newFileTrigger ?? 0);
  useEffect(() => {
    if (newFileTrigger != null && newFileTrigger !== newFileTriggerRef.current) {
      newFileTriggerRef.current = newFileTrigger;
      startNewFile("/", "新規ファイル.mdi");
    }
  }, [newFileTrigger, startNewFile]);

  const startNewFolder = useCallback(
    (parentPath: string) => {
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        next.add(parentPath);
        return next;
      });
      setEditing({ parentPath, kind: "new-folder", currentName: "" });
      refresh();
    },
    [refresh],
  );

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
  const handleDragMove = useCallback(
    async (srcPath: string, destDir: string) => {
      const name = srcPath.split("/").pop()!;
      const srcParent = srcPath.substring(0, srcPath.lastIndexOf("/")) || "/";
      // No-op if dropped back into the same parent
      if (srcParent === destDir) return;

      const newPath = destDir === "/" ? `/${name}` : `${destDir}/${name}`;
      try {
        const { getProjectFileService } = await import("@/lib/services/project-file-service");
        const vfs = getProjectFileService();

        const destVFSPath = toVFSPath(destDir) || "";
        const exists = await checkFileExists(vfs, destVFSPath, name);
        if (exists) {
          setOverwriteConfirm({
            name,
            execute: async () => {
              await vfs.rename(toVFSPath(srcPath), toVFSPath(newPath));
              // #1868: keep open tabs in sync with the moved path.
              onFileRenamed?.(toVFSPath(srcPath), toVFSPath(newPath));
              refresh();
            },
          });
          return;
        }

        await vfs.rename(toVFSPath(srcPath), toVFSPath(newPath));
        // #1868: keep open tabs in sync with the moved path.
        onFileRenamed?.(toVFSPath(srcPath), toVFSPath(newPath));
        refresh();
      } catch (error) {
        console.error("Failed to move:", error);
      }
    },
    [refresh, onFileRenamed],
  );

  /** Import external files dropped from the OS into destDir */
  const handleExternalFileDrop = useCallback(
    async (files: FileList, destDir: string) => {
      try {
        const { getProjectFileService } = await import("@/lib/services/project-file-service");
        const vfs = getProjectFileService();
        const destVFSPath = toVFSPath(destDir) || "";

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          // Reject non-text files before touching their bytes.
          // file.text() silently replaces invalid UTF-8 bytes with U+FFFD,
          // which would corrupt any binary (PDF, DOCX, image, …) dropped here.
          if (!isTextDroppable(file)) {
            notificationManager.error(
              `「${file.name}」はサポートされていない形式です。` +
                "テキストファイル（.mdi / .md / .txt）のみインポートできます。",
            );
            continue;
          }
          try {
            const content = await file.text();
            const filePath = destDir === "/" ? `/${file.name}` : `${destDir}/${file.name}`;

            const exists = await checkFileExists(vfs, destVFSPath, file.name);
            if (exists) {
              // Queue the first conflicting file for confirmation; subsequent ones follow
              const capturedContent = content;
              const capturedFilePath = filePath;
              setOverwriteConfirm({
                name: file.name,
                execute: async () => {
                  await vfs.writeFile(toVFSPath(capturedFilePath), capturedContent);
                  trackUsageEvent("project_file_created", {
                    surface: "explorer",
                    file_type: normalizeTelemetryFileType(file.name.split(".").pop() ?? ""),
                    collision: "confirmed",
                  });
                  refresh();
                },
              });
              // Stop processing remaining files — each must be confirmed individually
              return;
            }

            await vfs.writeFile(toVFSPath(filePath), content);
            trackUsageEvent("project_file_created", {
              surface: "explorer",
              file_type: normalizeTelemetryFileType(file.name.split(".").pop() ?? ""),
              collision: "none",
            });
          } catch (err) {
            console.warn("Failed to read external file:", file.name, err);
          }
        }
        refresh();
      } catch (error) {
        console.error("Failed to import external files:", error);
      }
    },
    [refresh],
  );

  // ---- Drag event handlers ----

  const DRAG_MIME = "application/x-illusions-tree-path";

  const handleDragStart = useCallback(
    (e: React.DragEvent, path: string, _kind: "file" | "directory") => {
      e.dataTransfer.setData(DRAG_MIME, path);
      e.dataTransfer.effectAllowed = "move";
      setDragSourcePath(path);
    },
    [],
  );

  const handleDragEnd = useCallback(() => {
    setDragSourcePath(null);
    setDropTargetPath(null);
    if (dragExpandTimerRef.current) {
      clearTimeout(dragExpandTimerRef.current);
      dragExpandTimerRef.current = null;
    }
  }, []);

  const handleTreeDragOver = useCallback(
    (e: React.DragEvent, path: string, kind: "file" | "directory") => {
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
          setExpandedDirs((prev) => {
            const next = new Set(prev);
            next.add(path);
            return next;
          });
          setRefreshToken((v) => v + 1);
          dragExpandTimerRef.current = null;
        }, 500);
      }
    },
    [dragSourcePath, expandedDirs],
  );

  const handleTreeDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDropTargetPath(null);
    if (dragExpandTimerRef.current) {
      clearTimeout(dragExpandTimerRef.current);
      dragExpandTimerRef.current = null;
    }
  }, []);

  const handleTreeDrop = useCallback(
    async (e: React.DragEvent, path: string, kind: "file" | "directory") => {
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
    },
    [handleDragMove, handleExternalFileDrop],
  );

  const handleContextAction = useCallback(
    async (action: string, fullPath: string, kind: "file" | "directory") => {
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
            const { getProjectFileService } = await import("@/lib/services/project-file-service");
            const vfs = getProjectFileService();
            const rootPath = vfs.getRootPath?.();
            if (rootPath && window.electronAPI?.revealInFileManager) {
              const vfsRelative = toVFSPath(fullPath);
              const absolutePath = vfsRelative ? `${rootPath}/${vfsRelative}` : rootPath;
              void window.electronAPI.revealInFileManager(absolutePath);
            } else if (rootPath && window.electronAPI?.showInFileManager) {
              const vfsRelative = toVFSPath(fullPath);
              const absolutePath = vfsRelative ? `${rootPath}/${vfsRelative}` : rootPath;
              void window.electronAPI.showInFileManager(absolutePath);
            }
          } catch (error) {
            console.error("Failed to reveal in Finder:", error);
          }
          break;
        }
      }
    },
    [handleDelete, handleDuplicate, handleDownload, startNewFile, startNewFolder],
  );

  const handleEditSubmit = useCallback(
    async (value: string) => {
      if (!editing) return;
      switch (editing.kind) {
        case "rename": {
          const fullPath =
            editing.parentPath === "/"
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
    },
    [editing, handleRename, handleNewFile, handleNewFolder],
  );

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        // Ignore IME composition confirmation — only handle real Enter
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        e.preventDefault();
        void handleEditSubmit(e.currentTarget.value);
      } else if (e.key === "Escape") {
        setEditing(null);
      }
    },
    [handleEditSubmit],
  );

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
  const onFileContextMenu = useCallback(
    async (e: React.MouseEvent, fullPath: string) => {
      e.stopPropagation();
      contextTargetRef.current = { path: fullPath, kind: "file" };
      const items = [
        { label: "名前の変更", action: "rename" },
        { label: "複製", action: "duplicate" },
        { label: "削除", action: "delete" },
        { label: "パソコンに保存", action: "download" },
        ...(isElectronRenderer()
          ? [
              { label: "", action: "_separator" },
              { label: `${getFileManagerName()} で表示`, action: "reveal-in-finder" },
            ]
          : []),
      ];
      const result = await showContextMenu(e, items);
      if (result) {
        void handleContextAction(result, fullPath, "file");
      }
    },
    [showContextMenu, handleContextAction],
  );

  const onFolderContextMenu = useCallback(
    async (e: React.MouseEvent, fullPath: string) => {
      e.stopPropagation();
      contextTargetRef.current = { path: fullPath, kind: "directory" };
      const isRoot = fullPath === "/";
      const items = [
        // Rename and delete are not available for the root folder
        ...(!isRoot ? [{ label: "名前の変更", action: "rename" }] : []),
        { label: "新規 MDI ファイル", action: "new-file-mdi" },
        { label: "新規 Markdown ファイル", action: "new-file-md" },
        { label: "新規テキストファイル", action: "new-file-txt" },
        { label: "新規フォルダ", action: "new-folder" },
        ...(!isRoot
          ? [
              { label: "", action: "_separator" },
              { label: "削除", action: "delete" },
            ]
          : []),
        ...(isElectronRenderer()
          ? [
              { label: "", action: "_separator" },
              { label: `${getFileManagerName()} で開く`, action: "open-in-finder" },
            ]
          : []),
      ];
      const result = await showContextMenu(e, items);
      if (result) {
        void handleContextAction(result, fullPath, "directory");
      }
    },
    [showContextMenu, handleContextAction],
  );

  /** Show root-level context menu when right-clicking the empty area below the file tree */
  const onEmptyAreaContextMenu = useCallback(
    async (e: React.MouseEvent) => {
      // Only fire when the click target is the container itself (not a bubbled child event)
      if (e.target !== e.currentTarget) return;
      e.preventDefault();
      contextTargetRef.current = { path: "/", kind: "directory" };
      const items = [
        { label: "新規 MDI ファイル", action: "new-file-mdi" },
        { label: "新規 Markdown ファイル", action: "new-file-md" },
        { label: "新規テキストファイル", action: "new-file-txt" },
        { label: "新規フォルダ", action: "new-folder" },
        ...(isElectronRenderer()
          ? [
              { label: "", action: "_separator" },
              { label: `${getFileManagerName()} で開く`, action: "open-in-finder" },
            ]
          : []),
      ];
      const result = await showContextMenu(e, items);
      if (result) {
        void handleContextAction(result, "/", "directory");
      }
    },
    [showContextMenu, handleContextAction],
  );

  /**
   * Build a synthetic React.MouseEvent-like object anchored at the focused row,
   * so existing context-menu handlers (which read clientX/clientY) can be invoked
   * from the keyboard (ContextMenu key / Shift+F10).
   */
  const synthContextMenuEvent = useCallback((path: string): React.MouseEvent => {
    const el = rowRefs.current.get(path);
    const rect = el?.getBoundingClientRect();
    const x = rect ? rect.left + 16 : 0;
    const y = rect ? rect.bottom : 0;
    return {
      clientX: x,
      clientY: y,
      preventDefault: () => {},
      stopPropagation: () => {},
      target: el,
      currentTarget: el,
    } as unknown as React.MouseEvent;
  }, []);

  /**
   * Keyboard handler for tree rows (WAI-ARIA Tree View pattern).
   * Operates on the flattened list of currently visible rows.
   */
  const handleRowKeyDown = useCallback(
    (e: React.KeyboardEvent, path: string, kind: "file" | "directory") => {
      // Never hijack typing inside the inline rename/new input.
      if (e.target instanceof HTMLInputElement) return;

      const rows = flattenVisibleRows(tree, expandedDirs);

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          const target = nextRowPath(rows, path);
          if (target) focusRow(target);
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const target = prevRowPath(rows, path);
          if (target) focusRow(target);
          break;
        }
        case "Home": {
          e.preventDefault();
          const target = firstRowPath(rows);
          if (target) focusRow(target);
          break;
        }
        case "End": {
          e.preventDefault();
          const target = lastRowPath(rows);
          if (target) focusRow(target);
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          const result = arrowRight(rows, path);
          if (result.expand) expandDir(result.expand);
          else if (result.focus) focusRow(result.focus);
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          const result = arrowLeft(rows, path);
          if (result.collapse) collapseDir(result.collapse);
          else if (result.focus) focusRow(result.focus);
          break;
        }
        case "Enter":
        case " ": {
          e.preventDefault();
          if (kind === "directory") {
            toggleDir(path);
          } else if (onFileClick) {
            onFileClick(toVFSPath(path));
          }
          break;
        }
        case "ContextMenu": {
          e.preventDefault();
          const ev = synthContextMenuEvent(path);
          if (kind === "directory") void onFolderContextMenu(ev, path);
          else void onFileContextMenu(ev, path);
          break;
        }
        case "F10": {
          if (!e.shiftKey) break;
          e.preventDefault();
          const ev = synthContextMenuEvent(path);
          if (kind === "directory") void onFolderContextMenu(ev, path);
          else void onFileContextMenu(ev, path);
          break;
        }
      }
    },
    [
      tree,
      expandedDirs,
      focusRow,
      expandDir,
      collapseDir,
      toggleDir,
      onFileClick,
      synthContextMenuEvent,
      onFolderContextMenu,
      onFileContextMenu,
    ],
  );

  // ---- Render tree entries ----
  const renderEntries = (entries: FileTreeEntry[], parentPath: string, level: number) => {
    const rows: React.ReactNode[] = [];

    for (const entry of entries) {
      const fullPath = parentPath === "/" ? `/${entry.name}` : `${parentPath}/${entry.name}`;

      // Check if this entry is being renamed
      const isRenaming =
        editing?.kind === "rename" &&
        editing.parentPath === parentPath &&
        editing.currentName === entry.name;

      if (entry.kind === "file") {
        const vfsFilePath = toVFSPath(fullPath);
        rows.push(
          <div
            key={fullPath}
            ref={(el) => registerRowRef(fullPath, el)}
            role="treeitem"
            aria-level={level}
            aria-selected={activeRowPath === fullPath}
            tabIndex={activeRowPath === fullPath ? 0 : -1}
            onKeyDown={(e) => handleRowKeyDown(e, fullPath, "file")}
            onFocus={() => setActiveRowPath(fullPath)}
            draggable={!isRenaming}
            onDragStart={(e) => handleDragStart(e, fullPath, "file")}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleTreeDragOver(e, fullPath, "file")}
            onDragLeave={handleTreeDragLeave}
            onDrop={(e) => {
              void handleTreeDrop(e, fullPath, "file");
            }}
            className={clsx(
              "flex items-center gap-1.5 px-2 py-1 text-sm text-foreground-secondary hover:bg-hover rounded cursor-pointer outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent -outline-offset-1",
              dragSourcePath === fullPath && "opacity-40",
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
            onContextMenu={(e) => {
              void onFileContextMenu(e, fullPath);
            }}
          >
            <div className="w-4 shrink-0" />
            <File className="w-4 h-4 shrink-0" />
            {isRenaming ? (
              renderEditInput(entry.name)
            ) : (
              <span className="truncate">{entry.name}</span>
            )}
          </div>,
        );
      } else {
        const isExpanded = expandedDirs.has(fullPath);
        const isFolderDropTarget = dropTargetPath === fullPath && dragSourcePath !== fullPath;
        rows.push(
          <div
            key={fullPath}
            onDragOver={(e) => handleTreeDragOver(e, fullPath, "directory")}
            onDragLeave={handleTreeDragLeave}
            onDrop={(e) => {
              void handleTreeDrop(e, fullPath, "directory");
            }}
          >
            <div
              ref={(el) => registerRowRef(fullPath, el)}
              role="treeitem"
              aria-level={level}
              aria-selected={activeRowPath === fullPath}
              aria-expanded={isExpanded}
              tabIndex={activeRowPath === fullPath ? 0 : -1}
              onKeyDown={(e) => handleRowKeyDown(e, fullPath, "directory")}
              onFocus={() => setActiveRowPath(fullPath)}
              draggable={!isRenaming}
              onDragStart={(e) => handleDragStart(e, fullPath, "directory")}
              onDragEnd={handleDragEnd}
              onClick={() => toggleDir(fullPath)}
              onContextMenu={(e) => {
                void onFolderContextMenu(e, fullPath);
              }}
              className={clsx(
                "group flex items-center gap-1.5 px-2 py-1 text-sm text-foreground hover:bg-hover rounded cursor-pointer outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent -outline-offset-1",
                dragSourcePath === fullPath && "opacity-40",
                isFolderDropTarget &&
                  "bg-accent/15 outline outline-1 outline-accent/50 -outline-offset-1",
              )}
              style={{ paddingLeft: `${level * 16 + 8}px` }}
            >
              <ChevronDown
                className={clsx(
                  "w-4 h-4 shrink-0 transition-transform",
                  !isExpanded && "-rotate-90",
                )}
              />
              <Folder className="w-4 h-4 shrink-0 text-accent" />
              {isRenaming ? (
                renderEditInput(entry.name)
              ) : (
                <span className="truncate font-medium flex-1">{entry.name}</span>
              )}
              {/* Inline hover buttons (VS Code style). Hidden from Tab order while
                  invisible; revealed (and tabbable) on hover or keyboard focus. */}
              {!isRenaming && (
                <span className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                  <button
                    className="p-0.5 hover:bg-hover rounded outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
                    title="新規ファイル"
                    aria-label={`${entry.name} に新規ファイルを作成`}
                    tabIndex={activeRowPath === fullPath ? 0 : -1}
                    onClick={(e) => {
                      e.stopPropagation();
                      startNewFile(fullPath, ".mdi");
                    }}
                  >
                    <FilePlus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    className="p-0.5 hover:bg-hover rounded outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
                    title="新規フォルダ"
                    aria-label={`${entry.name} に新規フォルダを作成`}
                    tabIndex={activeRowPath === fullPath ? 0 : -1}
                    onClick={(e) => {
                      e.stopPropagation();
                      startNewFolder(fullPath);
                    }}
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                  </button>
                </span>
              )}
            </div>
            {isExpanded && entry.children && (
              <div role="group">{renderEntries(entry.children, fullPath, level + 1)}</div>
            )}
            {/* New file/folder input row inside this directory */}
            {isExpanded &&
              editing &&
              editing.parentPath === fullPath &&
              (editing.kind === "new-file" || editing.kind === "new-folder") && (
                <div
                  className="flex items-center gap-1.5 px-2 py-1 text-sm"
                  style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
                >
                  <div className="w-4 shrink-0" />
                  {editing.kind === "new-file" ? (
                    <File className="w-4 h-4 shrink-0" />
                  ) : (
                    <Folder className="w-4 h-4 shrink-0 text-accent" />
                  )}
                  {renderEditInput("")}
                </div>
              )}
          </div>,
        );
      }
    }
    return rows;
  };

  return (
    <div
      className="space-y-1 min-h-full"
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={(e) => {
        // Fallback: drops that miss any specific item -> treat as root drop
        e.preventDefault();
        void handleTreeDrop(e, "/", "directory");
      }}
      onContextMenu={(e) => {
        void onEmptyAreaContextMenu(e);
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-foreground">ファイル</h3>
        <button
          className="p-1 text-foreground-tertiary hover:text-foreground hover:bg-hover rounded transition-colors"
          title="更新"
          aria-label="ファイル一覧を更新"
          onClick={refresh}
        >
          <RefreshCw className={clsx("w-4 h-4", loading && "animate-spin")} />
        </button>
      </div>

      {tree === null && !loading && (
        <p className="text-xs text-foreground-tertiary px-2">プロジェクトが開かれていません</p>
      )}

      {tree !== null && (
        <div role="tree" aria-label="プロジェクトファイル">
          {/* Root directory header */}
          <div
            ref={(el) => registerRowRef("/", el)}
            role="treeitem"
            aria-level={1}
            aria-selected={activeRowPath === "/"}
            aria-expanded={expandedDirs.has("/")}
            tabIndex={activeRowPath === "/" ? 0 : -1}
            onKeyDown={(e) => handleRowKeyDown(e, "/", "directory")}
            onFocus={() => setActiveRowPath("/")}
            onClick={() => toggleDir("/")}
            onContextMenu={(e) => {
              void onFolderContextMenu(e, "/");
            }}
            onDragOver={(e) => handleTreeDragOver(e, "/", "directory")}
            onDragLeave={handleTreeDragLeave}
            onDrop={(e) => {
              void handleTreeDrop(e, "/", "directory");
            }}
            className={clsx(
              "group flex items-center gap-1.5 px-2 py-1 text-sm text-foreground hover:bg-hover rounded cursor-pointer outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent -outline-offset-1",
              dropTargetPath === "/" &&
                dragSourcePath !== "/" &&
                "bg-accent/15 outline outline-1 outline-accent/50 -outline-offset-1",
            )}
          >
            <ChevronDown
              className={clsx(
                "w-4 h-4 shrink-0 transition-transform",
                !expandedDirs.has("/") && "-rotate-90",
              )}
            />
            <Folder className="w-4 h-4 shrink-0 text-accent" />
            <span className="truncate font-medium flex-1">{projectName || "プロジェクト"}</span>
            {/* Root inline buttons. Hidden from Tab order while invisible;
                revealed (and tabbable) on hover or keyboard focus. */}
            <span className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
              <button
                className="p-0.5 hover:bg-hover rounded outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
                title="新規ファイル"
                aria-label="プロジェクト直下に新規ファイルを作成"
                tabIndex={activeRowPath === "/" ? 0 : -1}
                onClick={(e) => {
                  e.stopPropagation();
                  startNewFile("/", ".mdi");
                }}
              >
                <FilePlus className="w-3.5 h-3.5" />
              </button>
              <button
                className="p-0.5 hover:bg-hover rounded outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
                title="新規フォルダ"
                aria-label="プロジェクト直下に新規フォルダを作成"
                tabIndex={activeRowPath === "/" ? 0 : -1}
                onClick={(e) => {
                  e.stopPropagation();
                  startNewFolder("/");
                }}
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
            </span>
          </div>
          {expandedDirs.has("/") && (
            <>
              {renderEntries(tree, "/", 1)}
              {/* New file/folder input at root level */}
              {editing &&
                editing.parentPath === "/" &&
                (editing.kind === "new-file" || editing.kind === "new-folder") && (
                  <div
                    className="flex items-center gap-1.5 px-2 py-1 text-sm"
                    style={{ paddingLeft: `${1 * 16 + 8}px` }}
                  >
                    <div className="w-4 shrink-0" />
                    {editing.kind === "new-file" ? (
                      <File className="w-4 h-4 shrink-0" />
                    ) : (
                      <Folder className="w-4 h-4 shrink-0 text-accent" />
                    )}
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

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        title="削除の確認"
        message={(() => {
          if (!deleteConfirm) return "";
          const base =
            deleteConfirm.kind === "directory"
              ? `フォルダ「${deleteConfirm.name}」を削除しますか？中のファイルもすべて削除されます。`
              : `ファイル「${deleteConfirm.name}」を削除しますか？`;
          // #1868: warn when open tabs — especially dirty ones — are affected.
          const dirtyTabs = deleteConfirm.affectedTabs.filter((t) => t.isDirty);
          if (dirtyTabs.length > 0) {
            const names = dirtyTabs.map((t) => `「${t.name}」`).join("、");
            return `${base}\n\n未保存の変更があるファイル（${names}）が開かれています。削除すると未保存の変更は失われます。`;
          }
          if (deleteConfirm.affectedTabs.length > 0) {
            return `${base}\n\n開いているタブはファイル未関連付けの状態になります。`;
          }
          return base;
        })()}
        confirmLabel="削除する"
        cancelLabel="キャンセル"
        dangerous={true}
        onConfirm={() => {
          if (deleteConfirm) {
            void executeDelete(deleteConfirm.path, deleteConfirm.kind, deleteConfirm.affectedTabs);
          }
          setDeleteConfirm(null);
        }}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* Overwrite confirmation dialog: shown when an operation targets an existing file */}
      <ConfirmDialog
        isOpen={overwriteConfirm !== null}
        title="上書きの確認"
        message={`「${overwriteConfirm?.name ?? ""}」はすでに存在します。上書きしますか？\nこの操作は元に戻せません。`}
        confirmLabel="上書きする"
        cancelLabel="キャンセル"
        dangerous={true}
        onConfirm={() => {
          const pending = overwriteConfirm;
          setOverwriteConfirm(null);
          if (pending) {
            void pending.execute();
          }
        }}
        onCancel={() => setOverwriteConfirm(null)}
      />
    </div>
  );
}

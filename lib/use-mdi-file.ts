"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { openMdiFile, saveMdiFile, type MdiFileDescriptor } from "./mdi-file";
import { isElectronRenderer } from "./runtime-env";
import { getStorageService } from "./storage-service";
import { persistAppState } from "./app-state-manager";
import { getRandomillusionstory } from "./illusion-stories";
import { getHistoryService } from "./history-service";
import { getVFS } from "./vfs";
import { useEditorMode } from "@/contexts/EditorModeContext";

const AUTO_SAVE_INTERVAL = 5000; // 5秒
const DEMO_FILE_NAME = "鏡地獄.mdi";

async function loadDemoContent(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  try {
    // 複数のパスパターンを試す（開発環境と本番環境の違いに対応）
    const paths = [
      "demo/鏡地獄.mdi",
      "/demo/鏡地獄.mdi",
      "./demo/鏡地獄.mdi"
    ];
    
    for (const path of paths) {
      try {
        const url = new URL(path, window.location.href);
        console.log('[Demo Loading] Trying to fetch:', url.toString());
        const response = await fetch(url.toString());
        if (response.ok) {
          const content = await response.text();
          console.log('[Demo Loading] Successfully loaded demo file, length:', content.length);
          return content;
        }
        console.warn('[Demo Loading] Failed to fetch from:', url.toString(), 'Status:', response.status);
      } catch (pathError) {
        console.warn('[Demo Loading] Error fetching from path:', path, pathError);
        continue;
      }
    }
    
    console.error('[Demo Loading] All demo file paths failed');
    return null;
  } catch (error) {
    console.error("デモ文書の読み込みに失敗しました:", error);
    return null;
  }
}

export interface UseMdiFileReturn {
  currentFile: MdiFileDescriptor | null;
  content: string;
  setContent: (content: string) => void;
  isDirty: boolean;
  isSaving: boolean;
  lastSavedTime: number | null;
  openFile: () => Promise<void>;
  saveFile: () => Promise<void>;
  saveAsFile: () => Promise<void>;
  newFile: () => void;
  updateFileName: (newName: string) => void;
  wasAutoRecovered?: boolean; // Webのみ: 自動復元されたかどうか
  // システムからファイルを開くリクエストを処理するためのコールバック
  onSystemFileOpen?: (handler: (path: string, content: string) => void) => void;
  // 内部使用：システムファイルを直接読み込む（安全チェックをスキップ）
  _loadSystemFile: (path: string, content: string) => void;
}

export function useMdiFile(options?: { skipAutoRestore?: boolean }): UseMdiFileReturn {
  const isElectron =
    typeof window !== "undefined" && isElectronRenderer();
  const { isProject } = useEditorMode();
  const skipAutoRestore = options?.skipAutoRestore ?? false;

  const [currentFile, setCurrentFile] = useState<MdiFileDescriptor | null>(null);
  const [content, setContentState] = useState<string>(() => getRandomillusionstory());
  const [lastSavedContent, setLastSavedContent] = useState<string>(() => getRandomillusionstory());
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<number | null>(null);
  const [wasAutoRecovered, setWasAutoRecovered] = useState(false);

  const contentRef = useRef<string>(content);
  const isSavingRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const systemFileOpenHandlerRef = useRef<((path: string, content: string) => void) | null>(null);

  contentRef.current = content;

  const isDirty = content !== lastSavedContent;

  const persistLastOpenedPath = useCallback(async (path: string) => {
    try {
      await persistAppState({ lastOpenedMdiPath: path });
    } catch (error) {
      console.error("最後に開いたパスの保存に失敗しました:", error);
    }
  }, []);

  /**
   * Attempt to create an auto-snapshot after a successful save (project mode only).
   * Failures are logged but never block or break the save operation.
   *
   * 保存成功後に自動スナップショットの作成を試みる（プロジェクトモードのみ）。
   * 失敗してもログ出力のみで、保存処理には影響しない。
   */
  const tryAutoSnapshot = useCallback(async (sourceFileName: string, savedContent: string) => {
    if (!isProject) return;
    // VFS root may not be opened yet (e.g., permission not restored after reload)
    if (!getVFS().isRootOpen()) return;
    try {
      const historyService = getHistoryService();
      const shouldCreate = await historyService.shouldCreateSnapshot(sourceFileName);
      if (shouldCreate) {
        await historyService.createSnapshot({
          sourceFile: sourceFileName,
          content: savedContent,
          type: "auto",
        });
      }
    } catch (error) {
      console.warn("自動スナップショットの作成に失敗しました:", error);
    }
  }, [isProject]);

  // Dirty 状態を Electron 側へ通知する
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.setDirty) return;
    window.electronAPI.setDirty(isDirty);
  }, [isDirty, isElectron]);

  // ストレージ初期化と、前回のファイルハンドル復元（Webのみ）
  useEffect(() => {
    const initializeStorage = async () => {
      try {
        // Detect ?welcome parameter: skip all auto-restore logic
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          if (params.has('welcome')) {
            console.log('[use-mdi-file] ?welcome detected, skipping auto-restore');
            return;
          }
        }

        const storage = getStorageService();
        await storage.initialize();
        const session = await storage.loadSession();
        const appState = await storage.loadAppState();
        const hasSeenDemo = appState?.hasSeenDemo ?? false;
        
        // ユーザーが実際にファイルを編集したことがあるかを判定
        // 設定項目（paragraphSpacing等）だけでは「編集済み」とみなさない
        const hasEditedFiles = Boolean(
          session &&
          (session.recentFiles.length > 0 ||
            session.editorBuffer ||
            appState?.lastOpenedMdiPath)
        );

        // デバッグログ
        console.log('[Demo Loading] Session data:', {
          session,
          appState,
          hasSeenDemo,
          hasEditedFiles,
          recentFilesCount: session?.recentFiles?.length ?? 0,
          hasEditorBuffer: Boolean(session?.editorBuffer),
          lastOpenedPath: appState?.lastOpenedMdiPath,
        });

        // Skip auto-restore if skipAutoRestore flag is set (e.g., when opening new window with ?welcome parameter)
        if (!skipAutoRestore) {
          // Web: エディタバッファからファイルハンドルの復元を試みる
          if (!isElectron) {
            const buffer = await storage.loadEditorBuffer();
            if (buffer?.fileHandle) {
              try {
                // 実ファイルへアクセスし、権限が残っているか確認する
                const file = await buffer.fileHandle.getFile();
                const content = await file.text();

                setCurrentFile({
                  path: null,
                  handle: buffer.fileHandle,
                  name: file.name,
                });
                setContentState(content);
                setLastSavedContent(content);
                setLastSavedTime(Date.now());
                setWasAutoRecovered(true);
                if (!hasSeenDemo) {
                  await persistAppState({ hasSeenDemo: true });
                }
                return;
              } catch (error) {
                console.warn("前回のファイルを復元できませんでした（権限が失効している可能性があります）:", error);
                // 古いハンドルを破棄する
                await storage.clearEditorBuffer();
              }
            }
          }

          if (!hasSeenDemo && !hasEditedFiles) {
            const demoContent = await loadDemoContent();
            if (demoContent) {
              setCurrentFile({
                path: null,
                handle: null,
                name: DEMO_FILE_NAME,
              });
              setContentState(demoContent);
              setLastSavedContent(demoContent);
              setLastSavedTime(null);
              setWasAutoRecovered(false);
              await persistAppState({ hasSeenDemo: true });
            }
          }
        }
      } catch (error) {
        console.error("ストレージの初期化に失敗しました:", error);
      }
    };

    void initializeStorage();
  }, [isElectron, skipAutoRestore]);

  const setContent = useCallback((newContent: string) => {
    setContentState(newContent);
  }, []);

  const newFile = useCallback(() => {
    const randomContent = getRandomillusionstory();
    setCurrentFile(null);
    setContentState(randomContent);
    setLastSavedContent(randomContent);
    setLastSavedTime(null);
    setWasAutoRecovered(false);
  }, []);

  // システムからファイルを開く内部関数（安全チェックなし）
  const loadSystemFile = useCallback((path: string, fileContent: string) => {
    const now = Date.now();
    setCurrentFile({
      path,
      handle: null,
      name: path.split("/").pop() || "無題",
    });
    setContentState(fileContent);
    setLastSavedContent(fileContent);
    setLastSavedTime(now);
  }, []);

  const updateFileName = useCallback((newName: string) => {
    if (!currentFile) {
      // ファイル未選択なら、新しい名前でディスクリプタを作る
      setCurrentFile({
        path: null,
        handle: null,
        name: newName,
      });
    } else {
      // 既存ディスクリプタの名前だけ更新する
      setCurrentFile({
        ...currentFile,
        name: newName,
      });
    }
  }, [currentFile]);

  const openFile = useCallback(async () => {
    const result = await openMdiFile();
    if (!result) {
      // キャンセル/エラー時は現状維持
      return;
    }
    const { descriptor, content: fileContent } = result;
    setCurrentFile(descriptor);
    setContentState(fileContent);
    setLastSavedContent(fileContent);
    setLastSavedTime(Date.now());
    
      // 最後に開いたファイルの参照（パス/ハンドル）を保存する
      try {
        if (isElectron && descriptor.path) {
          await persistLastOpenedPath(descriptor.path);
        } else if (!isElectron && descriptor.handle) {
          const storage = getStorageService();
          await storage.initialize();
          await storage.saveEditorBuffer({
            content: fileContent,
            timestamp: Date.now(),
            fileHandle: descriptor.handle,
          });
        }
      } catch (error) {
        console.error("ファイル参照の保存に失敗しました:", error);
      }

  }, [isElectron, persistLastOpenedPath]);

  const saveFile = useCallback(async (isAutoSave: boolean = false) => {
    if (isSavingRef.current) return;

    isSavingRef.current = true;
    setIsSaving(true);
    try {
      // Project mode: save directly via VFS (no system dialog)
      if (isProject && currentFile?.path) {
        const vfs = getVFS();
        await vfs.writeFile(currentFile.path, contentRef.current);
        setLastSavedContent(contentRef.current);
        // Set negative timestamp for auto-save to distinguish from manual save
        setLastSavedTime(isAutoSave ? -Date.now() : Date.now());
        void tryAutoSnapshot(currentFile.name, contentRef.current);
        return;
      }

      const result = await saveMdiFile({
        descriptor: currentFile,
        content: contentRef.current,
      });

      if (result) {
        const { descriptor } = result;
        setCurrentFile(descriptor);
        setLastSavedContent(contentRef.current);
        // Set negative timestamp for auto-save to distinguish from manual save
        setLastSavedTime(isAutoSave ? -Date.now() : Date.now());

        // 最後に開いたファイルの参照（パス/ハンドル）を保存する
        try {
          if (isElectron && descriptor.path) {
            await persistLastOpenedPath(descriptor.path);
          } else if (!isElectron && descriptor.handle) {
            const storage = getStorageService();
            await storage.initialize();
            await storage.saveEditorBuffer({
              content: contentRef.current,
              timestamp: Date.now(),
              fileHandle: descriptor.handle,
            });
          }
        } catch (error) {
          console.error("ファイル参照の保存に失敗しました:", error);
        }

        // Fire-and-forget: auto-snapshot in project mode
        // プロジェクトモード時、自動スナップショットを非同期で作成
        void tryAutoSnapshot(descriptor.name, contentRef.current);
      }
    } catch (error) {
      console.error("保存に失敗しました:", error);
      const message =
        error instanceof Error ? error.message : "不明なエラー";
      window.alert(`保存に失敗しました: ${message}`);
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [currentFile, isElectron, isProject, persistLastOpenedPath, tryAutoSnapshot]);

  // 「名前を付けて保存」: Always force file dialog by clearing descriptor path/handle
  const saveAsFile = useCallback(async () => {
    if (isSavingRef.current) return;

    isSavingRef.current = true;
    setIsSaving(true);
    const raw = contentRef.current;
    try {
      // Force dialog by clearing path/handle, keeping current name as suggestion
      const descriptor: MdiFileDescriptor | null = currentFile
        ? { path: null, handle: null, name: currentFile.name }
        : null;

      const result = await saveMdiFile({ descriptor, content: raw });

      if (result) {
        const { descriptor: newDescriptor } = result;
        setCurrentFile(newDescriptor);
        setLastSavedContent(raw);
        setLastSavedTime(Date.now());

        try {
          if (isElectron && newDescriptor.path) {
            await persistLastOpenedPath(newDescriptor.path);
          } else if (!isElectron && newDescriptor.handle) {
            const storage = getStorageService();
            await storage.initialize();
            await storage.saveEditorBuffer({
              content: raw,
              timestamp: Date.now(),
              fileHandle: newDescriptor.handle,
            });
          }
        } catch (error) {
          console.error("ファイル参照の保存に失敗しました:", error);
        }

        void tryAutoSnapshot(newDescriptor.name, raw);
      }
    } catch (error) {
      console.error("名前を付けて保存に失敗しました:", error);
      const message = error instanceof Error ? error.message : "不明なエラー";
      window.alert(`名前を付けて保存に失敗しました: ${message}`);
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [currentFile, isElectron, persistLastOpenedPath, tryAutoSnapshot]);

  // Stabilize auto-save with refs to avoid unnecessary timer recreation
  const saveFileRef = useRef(saveFile);
  saveFileRef.current = saveFile;
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const currentFileRef = useRef(currentFile);
  currentFileRef.current = currentFile;

  // Dirty かつファイル選択中なら、一定間隔で自動保存する
  useEffect(() => {
    autoSaveTimerRef.current = setInterval(() => {
      if (isDirtyRef.current && currentFileRef.current) {
        void saveFileRef.current(true); // Pass true to indicate auto-save
      }
    }, AUTO_SAVE_INTERVAL);

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
      }
    };
  }, []); // stable - no deps, refs handle value changes

  // Electron の「終了前に保存」要求を処理する
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onSaveBeforeClose) return;

    const cleanup = window.electronAPI.onSaveBeforeClose(async () => {
      if (isDirty) {
        await saveFile();
      }
      await window.electronAPI?.saveDoneAndClose?.();
    });

    return cleanup;
  }, [isDirty, saveFile, isElectron]);

  // システムから開かれたファイル（.mdi のダブルクリック等）を処理する
  // 実際の処理は page.tsx に委譲する（未保存チェックのため）
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onOpenFileFromSystem) return;

    const cleanup = window.electronAPI.onOpenFileFromSystem(({ path, content: fileContent }) => {
      // 登録されたハンドラがあれば呼び出す（page.tsx で登録される）
      if (systemFileOpenHandlerRef.current) {
        systemFileOpenHandlerRef.current(path, fileContent);
      } else {
        // ハンドラが未登録の場合は直接実行（後方互換性）
        const now = Date.now();
        setCurrentFile({
          path,
          handle: null,
          name: path.split("/").pop() || "無題",
        });
        setContentState(fileContent);
        setLastSavedContent(fileContent);
        setLastSavedTime(now);
      }
    });

    return cleanup;
  }, [isElectron]);

  // メニューの保存を処理する
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onMenuSave) return;

    const cleanup = window.electronAPI.onMenuSave(async () => {
      await saveFile();
    });

    return cleanup;
  }, [saveFile, isElectron]);

  // メニューの「名前を付けて保存」を処理する
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onMenuSaveAs) return;

    const cleanup = window.electronAPI.onMenuSaveAs(async () => {
      await saveAsFile();
    });

    return cleanup;
  }, [saveAsFile, isElectron]);

  // メニューの新規作成と「開く」は page.tsx で処理する（安全チェックを適用するため）
  // 以前はここで処理していたが、未保存チェックを統一するため移動した

  // Web の beforeunload を処理する
  useEffect(() => {
    if (isElectron) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, isElectron]);

  // システムファイルオープンのハンドラを登録する関数
  const onSystemFileOpen = useCallback((handler: (path: string, content: string) => void) => {
    systemFileOpenHandlerRef.current = handler;
  }, []);

  return {
    currentFile,
    content,
    setContent,
    isDirty,
    isSaving,
    lastSavedTime,
    openFile,
    saveFile,
    saveAsFile,
    newFile,
    updateFileName,
    wasAutoRecovered,
    onSystemFileOpen,
    _loadSystemFile: loadSystemFile,
  };
}

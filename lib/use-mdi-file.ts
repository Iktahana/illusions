"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { openMdiFile, saveMdiFile, type MdiFileDescriptor } from "./mdi-file";
import { isElectronRenderer } from "./runtime-env";
import { getStorageService } from "./storage-service";
import { persistAppState } from "./app-state-manager";

const DEFAULT_CONTENT = "# 錯覚\n\n物語はここから始めます。\n\n";
const AUTO_SAVE_INTERVAL = 2000; // 2秒
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
  newFile: () => void;
  updateFileName: (newName: string) => void;
  wasAutoRecovered?: boolean; // Webのみ: 自動復元されたかどうか
}

export function useMdiFile(): UseMdiFileReturn {
  const isElectron =
    typeof window !== "undefined" && isElectronRenderer();

  const [currentFile, setCurrentFile] = useState<MdiFileDescriptor | null>(null);
  const [content, setContentState] = useState<string>(DEFAULT_CONTENT);
  const [lastSavedContent, setLastSavedContent] = useState<string>(DEFAULT_CONTENT);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<number | null>(null);
  const [wasAutoRecovered, setWasAutoRecovered] = useState(false);

  const contentRef = useRef<string>(content);
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  contentRef.current = content;

  const isDirty = content !== lastSavedContent;

  const persistLastOpenedPath = useCallback(async (path: string) => {
    try {
      await persistAppState({ lastOpenedMdiPath: path });
    } catch (error) {
      console.error("最後に開いたパスの保存に失敗しました:", error);
    }
  }, []);

  // Dirty 状態を Electron 側へ通知する
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.setDirty) return;
    window.electronAPI.setDirty(isDirty);
  }, [isDirty, isElectron]);

  // ストレージ初期化と、前回のファイルハンドル復元（Webのみ）
  useEffect(() => {
    const initializeStorage = async () => {
      try {
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
      } catch (error) {
        console.error("ストレージの初期化に失敗しました:", error);
      }
    };

    void initializeStorage();
  }, [isElectron]);

  const setContent = useCallback((newContent: string) => {
    setContentState(newContent);
  }, []);

  const newFile = useCallback(() => {
    setCurrentFile(null);
    setContentState(DEFAULT_CONTENT);
    setLastSavedContent(DEFAULT_CONTENT);
    setLastSavedTime(null);
    setWasAutoRecovered(false);
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

  const saveFile = useCallback(async () => {
    if (isSaving) return;

    setIsSaving(true);
    try {
      const result = await saveMdiFile({
        descriptor: currentFile,
        content: contentRef.current,
      });

      if (result) {
        const { descriptor } = result;
        setCurrentFile(descriptor);
        setLastSavedContent(contentRef.current);
        setLastSavedTime(Date.now());
        
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
      }
    } catch (error) {
      console.error("保存に失敗しました:", error);
    } finally {
      setIsSaving(false);
    }
  }, [currentFile, isElectron, isSaving]);

  // Dirty かつファイル選択中なら、一定間隔で自動保存する
  useEffect(() => {
    const autoSave = async () => {
      if (isDirty && currentFile) {
        await saveFile();
      }
    };

    autoSaveTimerRef.current = setInterval(() => {
      void autoSave();
    }, AUTO_SAVE_INTERVAL);

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
      }
    };
  }, [isDirty, currentFile, saveFile]);

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
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onOpenFileFromSystem) return;

    const cleanup = window.electronAPI.onOpenFileFromSystem(({ path, content: fileContent }) => {
      const now = Date.now();
      setCurrentFile({
        path,
        handle: null,
        name: path.split("/").pop() || "無題",
      });
      setContentState(fileContent);
      setLastSavedContent(fileContent);
      setLastSavedTime(now);
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
      const raw = contentRef.current;
      setIsSaving(true);
      try {
        const descriptor: MdiFileDescriptor | null = currentFile
          ? {
              path: null,
              handle: null,
              name: currentFile.name,
            }
          : null;

        const result = await saveMdiFile({
          descriptor,
          content: raw,
        });

        if (result) {
          const { descriptor } = result;
          setCurrentFile(descriptor);
          setLastSavedContent(raw);
          setLastSavedTime(Date.now());
          
          // 最後に開いたファイルの参照（パス/ハンドル）を保存する
          try {
            const storage = getStorageService();
            await storage.initialize();
            
            if (descriptor.path) {
              await persistLastOpenedPath(descriptor.path);
            } else if (descriptor.handle) {
              await storage.saveEditorBuffer({
                content: raw,
                timestamp: Date.now(),
                fileHandle: descriptor.handle,
              });
            }
          } catch (error) {
            console.error("ファイル参照の保存に失敗しました:", error);
          }
        }
      } catch (error) {
        console.error("名前を付けて保存に失敗しました:", error);
      } finally {
        setIsSaving(false);
      }
    });

    return cleanup;
  }, [saveFile, isElectron, currentFile, persistLastOpenedPath]);

  // メニューの新規作成を処理する
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onMenuNew) return;

    const cleanup = window.electronAPI.onMenuNew(() => {
      newFile();
    });

    return cleanup;
  }, [newFile, isElectron]);

  // メニューの「開く」を処理する
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onMenuOpen) return;

    const cleanup = window.electronAPI.onMenuOpen(async () => {
      await openFile();
    });

    return cleanup;
  }, [openFile, isElectron]);

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

  return {
    currentFile,
    content,
    setContent,
    isDirty,
    isSaving,
    lastSavedTime,
    openFile,
    saveFile,
    newFile,
    updateFileName,
    wasAutoRecovered,
  };
}

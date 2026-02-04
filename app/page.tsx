"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Explorer from "@/components/Explorer";
import Inspector from "@/components/Inspector";
import NovelEditor from "@/components/Editor";
import ResizablePanel from "@/components/ResizablePanel";
import TitleUpdater from "@/components/TitleUpdater";
import ActivityBar, { type ActivityBarView } from "@/components/ActivityBar";
import SearchResults from "@/components/SearchResults";
import UnsavedWarningDialog from "@/components/UnsavedWarningDialog";
import WordFrequency from "@/components/WordFrequency";
import Characters from "@/components/Characters";
import Dictionary from "@/components/Dictionary";
import { useMdiFile } from "@/lib/use-mdi-file";
import { useUnsavedWarning } from "@/lib/use-unsaved-warning";
import { useElectronMenuHandlers } from "@/lib/use-electron-menu-handlers";
import { isElectronRenderer } from "@/lib/runtime-env";
import { fetchAppState, persistAppState } from "@/lib/app-state-manager";
import {
  countSentences,
  analyzeCharacterTypes,
  calculateCharacterUsageRates,
  calculateReadabilityScore,
  analyzeParticleUsage,
} from "@/lib/utils";

function chars(s: string) {
  return s.replace(/\s/g, "").length;
}

function words(s: string) {
  return s.split(/\s+/).filter(Boolean).length;
}

export default function EditorPage() {
  const mdiFile = useMdiFile();
  const { content, setContent, currentFile, isDirty, isSaving, lastSavedTime, openFile: originalOpenFile, saveFile, newFile: originalNewFile, updateFileName, wasAutoRecovered, onSystemFileOpen, _loadSystemFile } =
    mdiFile;

  const contentRef = useRef<string>(content);
  const editorDomRef = useRef<HTMLDivElement>(null);
  const [dismissedRecovery, setDismissedRecovery] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [searchOpenTrigger, setSearchOpenTrigger] = useState(0);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [saveToastExiting, setSaveToastExiting] = useState(false);
  const [selectedCharCount, setSelectedCharCount] = useState(0);
  // ファイルセッションID（ファイルの新規作成/切り替え時のみ更新）
  const fileSessionRef = useRef(0);
  const prevLastSavedTimeRef = useRef<number | null>(null);
  const hasAutoRecoveredRef = useRef(false);

  // 未保存警告の Hook を初期化
  const unsavedWarning = useUnsavedWarning(
    isDirty,
    saveFile,
    currentFile?.name || null
  );

  // 自動復元（ページ再読み込み）時はエディタを再マウントする
  useEffect(() => {
    if (wasAutoRecovered && !hasAutoRecoveredRef.current) {
      hasAutoRecoveredRef.current = true;
      fileSessionRef.current += 1;
      setEditorKey(prev => prev + 1);
    }
  }, [wasAutoRecovered]);

  // openFile/newFile をラップしてセッションIDを進める（安全チェック付き）
  const openFile = useCallback(async () => {
    await unsavedWarning.confirmBeforeAction(async () => {
      await originalOpenFile();

      // content の状態更新を反映してからエディタを再マウントする
      // setTimeout で originalOpenFile 由来の状態更新を React に先に処理させる
      setTimeout(() => {
        fileSessionRef.current += 1;
        setEditorKey(prev => prev + 1);
      }, 0);
    });
  }, [originalOpenFile, unsavedWarning]);

  const newFile = useCallback(() => {
    void unsavedWarning.confirmBeforeAction(() => {
      originalNewFile();
      fileSessionRef.current += 1;
      setEditorKey(prev => prev + 1);
    });
  }, [originalNewFile, unsavedWarning]);

  // Electron メニューの「新規」と「開く」をバインド（安全チェック付き）
  useElectronMenuHandlers(newFile, openFile);

  // システムからファイルを開く処理（安全チェック付き）
  useEffect(() => {
    if (!onSystemFileOpen) return;

    onSystemFileOpen((path: string, fileContent: string) => {
      void unsavedWarning.confirmBeforeAction(() => {
        // ファイルを直接読み込む
        _loadSystemFile(path, fileContent);
        
        // エディタを再マウント
        setTimeout(() => {
          fileSessionRef.current += 1;
          setEditorKey(prev => prev + 1);
        }, 0);
      });
    });
  }, [onSystemFileOpen, unsavedWarning, _loadSystemFile]);
  
  // エディタ表示設定
  const [fontScale, setFontScale] = useState(100); // 100% = 標準サイズ
  const [lineHeight, setLineHeight] = useState(1.8);
  const [paragraphSpacing, setParagraphSpacing] = useState(0); // 0em = 間隔なし
  const [textIndent, setTextIndent] = useState(1);
  const [fontFamily, setFontFamily] = useState('Noto Serif JP');
  const [charsPerLine, setCharsPerLine] = useState(40); // 0 = 制限なし（既定 40）
  const [showParagraphNumbers, setShowParagraphNumbers] = useState(true);
  const [posHighlightEnabled, setPosHighlightEnabled] = useState(false); // 品詞着色（デフォルト: 無効）
  const [posHighlightColors, setPosHighlightColors] = useState<Record<string, string>>({}); // 品詞ごとの色設定
  const [activeView, setActiveView] = useState<ActivityBarView>("explorer");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editorViewInstance, setEditorViewInstance] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [searchResults, setSearchResults] = useState<{matches: any[], searchTerm: string} | null>(null);
  
  const isElectron = typeof window !== "undefined" && isElectronRenderer();

  // lastSavedTime が更新されたら「保存完了」トーストを表示する
  useEffect(() => {
    if (lastSavedTime && prevLastSavedTimeRef.current !== lastSavedTime) {
      // 初回読み込みでは表示しない
      if (prevLastSavedTimeRef.current !== null) {
        setShowSaveToast(true);
        setSaveToastExiting(false);
        
        const hideTimer = setTimeout(() => {
          setSaveToastExiting(true);
          setTimeout(() => {
            setShowSaveToast(false);
            setSaveToastExiting(false);
          }, 150); // アニメーション時間に合わせる
        }, 1200);

        prevLastSavedTimeRef.current = lastSavedTime;
        return () => clearTimeout(hideTimer);
      }
      prevLastSavedTimeRef.current = lastSavedTime;
    }
  }, [lastSavedTime]);

  useEffect(() => {
    let mounted = true;

    const loadSettings = async () => {
      try {
        const appState = await fetchAppState();
        if (!mounted || !appState) return;
        if (typeof appState.paragraphSpacing === "number") {
          setParagraphSpacing(appState.paragraphSpacing);
        }
        if (typeof appState.showParagraphNumbers === "boolean") {
          setShowParagraphNumbers(appState.showParagraphNumbers);
        }
        if (typeof appState.posHighlightEnabled === "boolean") {
          setPosHighlightEnabled(appState.posHighlightEnabled);
        }
        if (appState.posHighlightColors && typeof appState.posHighlightColors === "object") {
          setPosHighlightColors(appState.posHighlightColors);
        }
      } catch (error) {
        console.error("設定の読み込みに失敗しました:", error);
      }
    };

    void loadSettings();

    return () => {
      mounted = false;
    };
  }, []);

  const handleParagraphSpacingChange = useCallback((value: number) => {
    setParagraphSpacing(value);
    void persistAppState({ paragraphSpacing: value }).catch((error) => {
      console.error("段落間隔の保存に失敗しました:", error);
    });
  }, []);

  const handleShowParagraphNumbersChange = useCallback((value: boolean) => {
    setShowParagraphNumbers(value);
    void persistAppState({ showParagraphNumbers: value }).catch((error) => {
      console.error("段落番号の設定保存に失敗しました:", error);
    });
  }, []);

  const handlePosHighlightEnabledChange = useCallback((value: boolean) => {
    setPosHighlightEnabled(value);
    void persistAppState({ posHighlightEnabled: value }).catch((error) => {
      console.error("品詞着色の設定保存に失敗しました:", error);
    });
  }, []);

  const handlePosHighlightColorsChange = useCallback((value: Record<string, string>) => {
    setPosHighlightColors(value);
    void persistAppState({ posHighlightColors: value }).catch((error) => {
      console.error("品詞色設定の保存に失敗しました:", error);
    });
  }, []);

   // 復元通知は5秒後に自動で閉じる
   useEffect(() => {
     if (wasAutoRecovered && !dismissedRecovery) {
       const timer = setTimeout(() => {
         setDismissedRecovery(true);
       }, 5000);
       
       return () => clearTimeout(timer);
     }
   }, [wasAutoRecovered, dismissedRecovery]);

   // プレーンテキストとして貼り付け
   const handlePasteAsPlaintext = useCallback(async () => {
     try {
       let text: string | null = null;
       
       // eslint-disable-next-line @typescript-eslint/no-explicit-any
       if (isElectron && typeof window !== "undefined" && (window as any).electronAPI) {
          // Electron: 将来的にはメインプロセス経由でクリップボード取得（IPC）も検討
          // ひとまず標準のクリップボードAPIが使える場合はそれを利用する
          if (navigator.clipboard && navigator.clipboard.readText) {
            text = await navigator.clipboard.readText();
          }
        } else {
          // Web: クリップボードAPIでプレーンテキストを取得する
          if (navigator.clipboard && navigator.clipboard.readText) {
            text = await navigator.clipboard.readText();
          }
        }
       
       if (text) {
         const currentContent = contentRef.current;
         const newContent = currentContent ? `${currentContent}\n\n${text}` : text;
         setContent(newContent);
         setEditorKey(prev => prev + 1);
       }
      } catch (error) {
        console.error("プレーンテキストとして貼り付けできませんでした:", error);
      }
    }, [isElectron, setContent]);

   // メニューの「プレーンテキストで貼り付け」を受け取る（Electronのみ）
   useEffect(() => {
     if (!isElectron || typeof window === "undefined") return;

     // eslint-disable-next-line @typescript-eslint/no-explicit-any
     const unsubscribe = (window as any).electronAPI?.onPasteAsPlaintext?.(() => {
       void handlePasteAsPlaintext();
     });

     return () => {
       unsubscribe?.();
     };
   }, [isElectron, handlePasteAsPlaintext]);


  contentRef.current = content;

  const handleChange = (markdown: string) => {
    contentRef.current = markdown;
    setContent(markdown);
  };

  const handleInsertText = (text: string) => {
    const currentContent = contentRef.current;
    const newContent = currentContent ? `${currentContent}\n\n${text}` : text;
    // 見出しアンカーはエディタ側で管理するため、ここでの追加処理は不要
    setContent(newContent);
    // 新しい内容で確実に反映させるため、エディタを再マウントする
    setEditorKey(prev => prev + 1);
  };

   const handleChapterClick = (anchorId: string) => {
    if (!anchorId) return;

    const target = document.getElementById(anchorId) as HTMLElement | null;
    if (!target) return;

    // 対象行を表示位置へスクロール
    // console.debug('[AutoScroll] Scroll target into view', { anchorId, options: { behavior: 'smooth', block: 'start' } });
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    // 任意: フォーカスして視線誘導
    // console.debug('[AutoScroll] Focus target after scroll', { anchorId });
    target.focus();
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleShowAllSearchResults = (matches: any[], searchTerm: string) => {
    setSearchResults({ matches, searchTerm });
    setActiveView("search");
  };

  const handleCloseSearchResults = () => {
    setSearchResults(null);
    setActiveView("explorer");
  };

   const wordCount = words(content);
   const charCount = chars(content);

   // 段落数を計算（空行で区切る）
   const paragraphCount = content ? content.split(/\n\n+/).filter(p => p.trim().length > 0).length : 0;

   // 日本語テキストの詳細統計を算出
   const sentenceCount = countSentences(content);
   const charTypeAnalysis = analyzeCharacterTypes(content);
   const charUsageRates = calculateCharacterUsageRates(charTypeAnalysis);
   const readabilityAnalysis = calculateReadabilityScore(content);
   const particleAnalysis = analyzeParticleUsage(content);

   // ファイル名は currentFile.name のみを使用（isDirtyに基づく*の追加はInspectorコンポーネント側で処理）
   const fileName = currentFile?.name ?? "新規ファイル";

   // キーボードショートカット: Cmd/Ctrl+S=保存、Cmd/Ctrl+F=検索
   useEffect(() => {
     const handleKeyDown = (event: KeyboardEvent) => {
       const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
       
       // Cmd+S（macOS）/ Ctrl+S（Windows/Linux）: 保存
       const isSaveShortcut = isMac
         ? event.metaKey && event.key === "s"
         : event.ctrlKey && event.key === "s";

       // Cmd+F（macOS）/ Ctrl+F（Windows/Linux）: 検索
       const isSearchShortcut = isMac
         ? event.metaKey && event.key === "f"
         : event.ctrlKey && event.key === "f";

       // Shift+Cmd+V（macOS）/ Shift+Ctrl+V（Windows/Linux）: プレーンテキスト貼り付け
       const isPasteAsPlaintextShortcut = isMac
         ? event.shiftKey && event.metaKey && event.key === "v"
         : event.shiftKey && event.ctrlKey && event.key === "v";

       if (isSaveShortcut) {
         event.preventDefault(); // ブラウザ既定の保存ダイアログを抑止
         void saveFile();
       } else if (isSearchShortcut) {
         event.preventDefault(); // ブラウザ既定の検索ダイアログを抑止
         setSearchOpenTrigger(prev => prev + 1); // 検索ダイアログを開く
       } else if (isPasteAsPlaintextShortcut) {
         event.preventDefault(); // 既定の貼り付け動作を抑止
         void handlePasteAsPlaintext();
       }
     };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [saveFile, handlePasteAsPlaintext]);

   return (
     <div className="h-screen flex flex-col overflow-hidden relative">
        {/* 動的なタイトル更新 */}
       <TitleUpdater currentFile={currentFile} isDirty={isDirty} />

        {/* 未保存警告ダイアログ */}
       <UnsavedWarningDialog
         isOpen={unsavedWarning.showWarning}
         fileName={currentFile?.name || "新規ファイル"}
         onSave={unsavedWarning.handleSave}
         onDiscard={unsavedWarning.handleDiscard}
         onCancel={unsavedWarning.handleCancel}
       />

        {/* 自動復元の通知（Webのみ・固定表示） */}
       {!isElectron && wasAutoRecovered && !dismissedRecovery && (
        <div className="fixed left-0 top-0 right-0 z-50 bg-background-elevated border-b border-border px-4 py-3 flex items-center justify-between animate-slide-in-down shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-success rounded-full flex-shrink-0 animate-pulse-glow"></div>
            <p className="text-sm text-foreground">
              <span className="font-semibold text-foreground">✓ 前回編集したファイルを復元しました：</span> <span className="font-mono text-success">{currentFile?.name}</span>
            </p>
          </div>
          <button
            onClick={() => setDismissedRecovery(true)}
            className="text-foreground-secondary hover:text-foreground hover:bg-hover text-lg font-medium flex-shrink-0 ml-4 w-8 h-8 rounded flex items-center justify-center transition-all duration-200 hover:scale-110"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Activity Bar */}
        <ActivityBar activeView={activeView} onViewChange={setActiveView} />
        
        {/* 左侧面板 */}
        {activeView !== "none" && (
          <ResizablePanel side="left" defaultWidth={256} minWidth={200} maxWidth={400}>
            {activeView === "explorer" && (
              <Explorer 
                content={content} 
                onChapterClick={handleChapterClick} 
                onInsertText={handleInsertText}
                fontScale={fontScale}
                onFontScaleChange={setFontScale}
                lineHeight={lineHeight}
                onLineHeightChange={setLineHeight}
                paragraphSpacing={paragraphSpacing}
                onParagraphSpacingChange={handleParagraphSpacingChange}
                textIndent={textIndent}
                onTextIndentChange={setTextIndent}
                fontFamily={fontFamily}
                onFontFamilyChange={setFontFamily}
                charsPerLine={charsPerLine}
                onCharsPerLineChange={setCharsPerLine}
                showParagraphNumbers={showParagraphNumbers}
                onShowParagraphNumbersChange={handleShowParagraphNumbersChange}
              />
            )}
            {activeView === "search" && (
              <SearchResults
                editorView={editorViewInstance}
                matches={searchResults?.matches}
                searchTerm={searchResults?.searchTerm}
                onClose={handleCloseSearchResults}
              />
            )}
            {activeView === "outline" && (
              <div className="h-full bg-background-secondary border-r border-border p-4">
                <h2 className="text-lg font-semibold text-foreground mb-4">アウトライン</h2>
                <p className="text-sm text-foreground-secondary">アウトライン機能は開発中です</p>
              </div>
            )}
            {activeView === "characters" && (
              <Characters content={content} />
            )}
            {activeView === "dictionary" && (
              <Dictionary content={content} />
            )}
            {activeView === "settings" && (
              <div className="h-full bg-background-secondary border-r border-border p-4">
                <h2 className="text-lg font-semibold text-foreground mb-4">設定</h2>
                <p className="text-sm text-foreground-secondary">設定機能は開発中です</p>
              </div>
            )}
            {activeView === "wordfreq" && (
              <WordFrequency content={content} />
            )}
          </ResizablePanel>
        )}
        
        <main className="flex-1 flex flex-col overflow-hidden min-h-0 relative">
          <div ref={editorDomRef} className="flex-1 min-h-0">
            <NovelEditor
              key={`file-${fileSessionRef.current}-${editorKey}`}
              initialContent={content}
              onChange={handleChange}
              onInsertText={handleInsertText}
              onSelectionChange={setSelectedCharCount}
              fontScale={fontScale}
              lineHeight={lineHeight}
              paragraphSpacing={paragraphSpacing}
              textIndent={textIndent}
              fontFamily={fontFamily}
              charsPerLine={charsPerLine}
              searchOpenTrigger={searchOpenTrigger}
              showParagraphNumbers={showParagraphNumbers}
              onEditorViewReady={setEditorViewInstance}
              onShowAllSearchResults={handleShowAllSearchResults}
              posHighlightEnabled={posHighlightEnabled}
              posHighlightColors={posHighlightColors}
            />
          </div>
          
           {/* 保存完了トースト */}
          {showSaveToast && (
            <div 
              className={`fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-background-elevated border border-border rounded-lg shadow-lg flex items-center gap-2 z-50 ${
                saveToastExiting ? 'animate-save-toast-out' : 'animate-save-toast-in'
              }`}
            >
              <span className="text-success text-sm font-medium">✓</span>
              <span className="text-foreground-secondary text-sm">保存完了</span>
            </div>
          )}
        </main>
        
         {/* 右侧面板：统计信息（始终显示） */}
         <ResizablePanel side="right" defaultWidth={256} minWidth={200} maxWidth={400}>
          <Inspector
            wordCount={wordCount}
            charCount={charCount}
            selectedCharCount={selectedCharCount}
            paragraphCount={paragraphCount}
            fileName={fileName}
            isDirty={isDirty}
            isSaving={isSaving}
            lastSavedTime={lastSavedTime}
            onOpenFile={openFile}
            onNewFile={newFile}
            onSaveFile={saveFile}
            onFileNameChange={updateFileName}
            sentenceCount={sentenceCount}
            charTypeAnalysis={charTypeAnalysis}
            charUsageRates={charUsageRates}
            readabilityAnalysis={readabilityAnalysis}
            particleAnalysis={particleAnalysis}
            posHighlightEnabled={posHighlightEnabled}
            onPosHighlightEnabledChange={handlePosHighlightEnabledChange}
            posHighlightColors={posHighlightColors}
            onPosHighlightColorsChange={handlePosHighlightColorsChange}
          />
        </ResizablePanel>
      </div>
    </div>
  );
}

import type { Dispatch, SetStateAction } from "react";
import { useCallback, useState } from "react";

import type { ActivityBarView } from "@/components/ActivityBar";
import { isBottomView } from "@/components/ActivityBar";
import type { SettingsCategory } from "@/components/SettingsModal";
import type { SearchTarget } from "./find-search-matches";

export interface PanelState {
  topView: ActivityBarView;
  bottomView: ActivityBarView;
  /** 単一の検索 source of truth。SearchDialog（フローティング窓）と SearchResults
   *  （サイドパネル）の両方がこれを共有し、内容のズレを防ぐ。 */
  searchTerm: string;
  caseSensitive: boolean;
  regexSearch: boolean;
  wholeWordSearch: boolean;
  normalizeVariants: boolean;
  excludeComments: boolean;
  searchTarget: SearchTarget;
  selectionOnly: boolean;
  /** 現在フォーカス中のマッチ index。両 UI のナビ／クリックで共有更新する。 */
  currentMatchIndex: number;
  isRightPanelCollapsed: boolean;
  dictionarySearchTrigger: { term: string; id: number };
  settingsInitialCategory: SettingsCategory | undefined;
  switchToCorrectionsTrigger: number;
  showRubyDialog: boolean;
  rubySelectedText: string;
  editorDiff: { snapshotContent: string; currentContent: string; label: string } | null;
}

export interface PanelHandlers {
  setTopView: (view: ActivityBarView) => void;
  setBottomView: (view: ActivityBarView) => void;
  setIsRightPanelCollapsed: Dispatch<SetStateAction<boolean>>;
  setSettingsInitialCategory: (category: SettingsCategory | undefined) => void;
  setShowRubyDialog: (show: boolean) => void;
  setRubySelectedText: (text: string) => void;
  setEditorDiff: (
    diff: { snapshotContent: string; currentContent: string; label: string } | null,
  ) => void;
  handleOpenDictionary: (searchTerm?: string) => void;
  setSearchTerm: (term: string) => void;
  setCaseSensitive: Dispatch<SetStateAction<boolean>>;
  setRegexSearch: Dispatch<SetStateAction<boolean>>;
  setWholeWordSearch: Dispatch<SetStateAction<boolean>>;
  setNormalizeVariants: Dispatch<SetStateAction<boolean>>;
  setExcludeComments: Dispatch<SetStateAction<boolean>>;
  setSearchTarget: Dispatch<SetStateAction<SearchTarget>>;
  setSelectionOnly: Dispatch<SetStateAction<boolean>>;
  setCurrentMatchIndex: Dispatch<SetStateAction<number>>;
  /** サイドバー検索パネルを開く（共有 searchTerm をそのまま表示）。 */
  handleShowAllSearchResults: () => void;
  handleCloseSearchResults: () => void;
  handleOpenLintingSettings: () => void;
  handleOpenPosHighlightSettings: () => void;
  handleOpenPowerSettings: () => void;
  triggerSwitchToCorrections: () => void;
}

interface UsePanelStateParams {
  setShowSettingsModal: (value: boolean) => void;
}

/**
 * Manages sidebar panel state, activity bar views, and panel-related handlers.
 */
export function usePanelState({ setShowSettingsModal }: UsePanelStateParams): {
  state: PanelState;
  handlers: PanelHandlers;
} {
  const [topView, setTopView] = useState<ActivityBarView>("explorer");
  const [bottomView, setBottomView] = useState<ActivityBarView>("none");
  const [searchTerm, setSearchTermRaw] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regexSearch, setRegexSearch] = useState(false);
  const [wholeWordSearch, setWholeWordSearch] = useState(false);
  const [normalizeVariants, setNormalizeVariants] = useState(false);
  const [excludeComments, setExcludeComments] = useState(true);
  const [searchTarget, setSearchTarget] = useState<SearchTarget>("all");
  const [selectionOnly, setSelectionOnly] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);
  const [dictionarySearchTrigger, setDictionarySearchTrigger] = useState<{
    term: string;
    id: number;
  }>({ term: "", id: 0 });
  const [settingsInitialCategory, setSettingsInitialCategory] = useState<
    SettingsCategory | undefined
  >(undefined);
  const [switchToCorrectionsTrigger, setSwitchToCorrectionsTrigger] = useState(0);
  const [showRubyDialog, setShowRubyDialog] = useState(false);
  const [rubySelectedText, setRubySelectedText] = useState("");
  const [editorDiff, setEditorDiff] = useState<{
    snapshotContent: string;
    currentContent: string;
    label: string;
  } | null>(null);

  const handleOpenDictionary = useCallback((searchTerm?: string) => {
    if (searchTerm) {
      setDictionarySearchTrigger((prev) => ({ term: searchTerm, id: prev.id + 1 }));
    }
    // Dictionary belongs to the bottom activity group. If it's already open in
    // either slot, just (re)trigger the search — don't spawn a second panel.
    setTopView((top) => {
      if (top === "dictionary") return top;
      if (isBottomView("dictionary")) return top;
      return "dictionary";
    });
    setBottomView((bottom) => {
      if (bottom === "dictionary") return bottom;
      if (isBottomView("dictionary")) return "dictionary";
      return bottom;
    });
  }, []);

  // 検索語変更時は現在マッチ index を先頭へリセットする。
  const setSearchTerm = useCallback((term: string) => {
    setSearchTermRaw(term);
    setCurrentMatchIndex(0);
  }, []);

  const handleShowAllSearchResults = useCallback(() => {
    setTopView("search");
  }, []);

  const handleCloseSearchResults = useCallback(() => {
    setTopView("explorer");
  }, []);

  const handleOpenLintingSettings = useCallback(() => {
    setSettingsInitialCategory("linting");
    setShowSettingsModal(true);
  }, [setShowSettingsModal]);

  const handleOpenPosHighlightSettings = useCallback(() => {
    setSettingsInitialCategory("pos-highlight");
    setShowSettingsModal(true);
  }, [setShowSettingsModal]);

  const handleOpenPowerSettings = useCallback(() => {
    setSettingsInitialCategory("power");
    setShowSettingsModal(true);
  }, [setShowSettingsModal]);

  const triggerSwitchToCorrections = useCallback(() => {
    setSwitchToCorrectionsTrigger((n) => n + 1);
  }, []);

  return {
    state: {
      topView,
      bottomView,
      searchTerm,
      caseSensitive,
      regexSearch,
      wholeWordSearch,
      normalizeVariants,
      excludeComments,
      searchTarget,
      selectionOnly,
      currentMatchIndex,
      isRightPanelCollapsed,
      dictionarySearchTrigger,
      settingsInitialCategory,
      switchToCorrectionsTrigger,
      showRubyDialog,
      rubySelectedText,
      editorDiff,
    },
    handlers: {
      setTopView,
      setBottomView,
      setIsRightPanelCollapsed,
      setSettingsInitialCategory,
      setShowRubyDialog,
      setRubySelectedText,
      setEditorDiff,
      handleOpenDictionary,
      setSearchTerm,
      setCaseSensitive,
      setRegexSearch,
      setWholeWordSearch,
      setNormalizeVariants,
      setExcludeComments,
      setSearchTarget,
      setSelectionOnly,
      setCurrentMatchIndex,
      handleShowAllSearchResults,
      handleCloseSearchResults,
      handleOpenLintingSettings,
      handleOpenPosHighlightSettings,
      handleOpenPowerSettings,
      triggerSwitchToCorrections,
    },
  };
}

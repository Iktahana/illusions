import type { Dispatch, SetStateAction } from "react";
import { useCallback, useState } from "react";

import type { ActivityBarView } from "@/components/ActivityBar";
import type { SettingsCategory } from "@/components/SettingsModal";

export interface PanelState {
  topView: ActivityBarView;
  bottomView: ActivityBarView;
  searchResults: { matches: { from: number; to: number }[]; searchTerm: string } | null;
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
  setEditorDiff: (diff: { snapshotContent: string; currentContent: string; label: string } | null) => void;
  handleOpenDictionary: (searchTerm?: string) => void;
  handleShowAllSearchResults: (matches: { from: number; to: number }[], searchTerm: string) => void;
  handleCloseSearchResults: () => void;
  handleOpenLintingSettings: () => void;
  handleOpenPosHighlightSettings: () => void;
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
  const [searchResults, setSearchResults] = useState<{ matches: { from: number; to: number }[]; searchTerm: string } | null>(null);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);
  const [dictionarySearchTrigger, setDictionarySearchTrigger] = useState<{ term: string; id: number }>({ term: "", id: 0 });
  const [settingsInitialCategory, setSettingsInitialCategory] = useState<SettingsCategory | undefined>(undefined);
  const [switchToCorrectionsTrigger, setSwitchToCorrectionsTrigger] = useState(0);
  const [showRubyDialog, setShowRubyDialog] = useState(false);
  const [rubySelectedText, setRubySelectedText] = useState("");
  const [editorDiff, setEditorDiff] = useState<{ snapshotContent: string; currentContent: string; label: string } | null>(null);

  const handleOpenDictionary = useCallback((searchTerm?: string) => {
    if (searchTerm) {
      setDictionarySearchTrigger(prev => ({ term: searchTerm, id: prev.id + 1 }));
    }
    setTopView("dictionary");
  }, []);

  const handleShowAllSearchResults = useCallback((matches: { from: number; to: number }[], searchTerm: string) => {
    setSearchResults({ matches, searchTerm });
    setTopView("search");
  }, []);

  const handleCloseSearchResults = useCallback(() => {
    setSearchResults(null);
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

  const triggerSwitchToCorrections = useCallback(() => {
    setSwitchToCorrectionsTrigger((n) => n + 1);
  }, []);

  return {
    state: {
      topView,
      bottomView,
      searchResults,
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
      handleShowAllSearchResults,
      handleCloseSearchResults,
      handleOpenLintingSettings,
      handleOpenPosHighlightSettings,
      triggerSwitchToCorrections,
    },
  };
}

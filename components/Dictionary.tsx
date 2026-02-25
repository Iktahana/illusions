"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Edit2, BookOpen, ChevronDown, ChevronRight, Search, Globe, ExternalLink } from "lucide-react";
import GlassDialog from "@/components/GlassDialog";
import type { UserDictionaryEntry } from "@/lib/project/project-types";
import type { EditorMode } from "@/lib/project/project-types";
import { isProjectMode, isStandaloneMode } from "@/lib/project/project-types";
import { getUserDictionaryService } from "@/lib/services/user-dictionary-service";

// Predefined POS values matching PosType
const POS_OPTIONS = [
  "名詞",
  "動詞",
  "形容詞",
  "副詞",
  "助詞",
  "助動詞",
  "接続詞",
  "感動詞",
  "記号",
  "連体詞",
  "フィラー",
  "その他",
] as const;

// Web dictionary sources
interface WebDictionarySource {
  id: string;
  name: string;
  urlTemplate: string;
}

const WEB_DICTIONARIES: WebDictionarySource[] = [
  {
    id: "weblio-thesaurus",
    name: "Weblio類語辞典",
    urlTemplate: "https://thesaurus.weblio.jp/content/{query}",
  },
  {
    id: "kotobank",
    name: "コトバンク",
    urlTemplate: "https://kotobank.jp/word/{query}",
  },
];

const isElectron = (): boolean => {
  return typeof window !== "undefined" &&
    typeof window.process !== "undefined" &&
    window.process?.type === "renderer";
};

const EMPTY_FORM: Partial<UserDictionaryEntry> = {
  word: "",
  reading: "",
  partOfSpeech: "",
  definition: "",
  examples: "",
  notes: "",
};

interface DictionaryProps {
  content?: string;
  initialSearchTerm?: string;
  searchTriggerId?: number;
  editorMode?: EditorMode;
}

export default function Dictionary({ content, initialSearchTerm, searchTriggerId, editorMode }: DictionaryProps) {
  const [activeTab, setActiveTab] = useState<"user" | "web">("web");
  const [userEntries, setUserEntries] = useState<UserDictionaryEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Modal state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<UserDictionaryEntry | null>(null);
  const [formData, setFormData] = useState<Partial<UserDictionaryEntry>>(EMPTY_FORM);

  // Search state
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [activeSearchQuery, setActiveSearchQuery] = useState("");

  // Persistence
  const dictService = getUserDictionaryService();

  const loadEntries = useCallback(async () => {
    try {
      if (editorMode && isProjectMode(editorMode)) {
        const entries = await dictService.loadEntries();
        setUserEntries(entries);
      } else if (editorMode && isStandaloneMode(editorMode)) {
        const entries = dictService.loadEntriesStandalone(editorMode.fileName);
        setUserEntries(entries);
      }
    } catch {
      // Silently fail — dictionary is not critical
    }
  }, [editorMode, dictService]);

  const persistEntries = useCallback(async (entries: UserDictionaryEntry[]) => {
    try {
      if (editorMode && isProjectMode(editorMode)) {
        await dictService.saveEntries(entries);
      } else if (editorMode && isStandaloneMode(editorMode)) {
        dictService.saveEntriesStandalone(editorMode.fileName, entries);
      }
    } catch {
      // Silently fail
    }
  }, [editorMode, dictService]);

  // Load entries on mount / mode change
  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  // Update search when initialSearchTerm changes
  useEffect(() => {
    if (initialSearchTerm && searchTriggerId) {
      setGlobalSearchQuery(initialSearchTerm);
      setActiveSearchQuery(initialSearchTerm);
    }
  }, [initialSearchTerm, searchTriggerId]);

  // --- Modal handlers ---

  const handleOpenAddDialog = () => {
    setEditingEntry(null);
    setFormData(EMPTY_FORM);
    setIsDialogOpen(true);
  };

  const handleOpenEditDialog = (entry: UserDictionaryEntry) => {
    setEditingEntry(entry);
    setFormData({
      word: entry.word,
      reading: entry.reading ?? "",
      partOfSpeech: entry.partOfSpeech ?? "",
      definition: entry.definition ?? "",
      examples: entry.examples ?? "",
      notes: entry.notes ?? "",
    });
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingEntry(null);
    setFormData(EMPTY_FORM);
  };

  const handleSaveEntry = async () => {
    if (!formData.word?.trim()) return;

    if (editingEntry) {
      // Update existing
      const updated = userEntries.map((e) =>
        e.id === editingEntry.id
          ? {
              ...e,
              word: formData.word?.trim() ?? e.word,
              reading: formData.reading?.trim() || undefined,
              partOfSpeech: formData.partOfSpeech?.trim() || undefined,
              definition: formData.definition?.trim() || undefined,
              examples: formData.examples?.trim() || undefined,
              notes: formData.notes?.trim() || undefined,
            }
          : e,
      );
      setUserEntries(updated);
      await persistEntries(updated);
    } else {
      // Add new
      const entry: UserDictionaryEntry = {
        id: Date.now().toString(),
        word: formData.word.trim(),
        reading: formData.reading?.trim() || undefined,
        partOfSpeech: formData.partOfSpeech?.trim() || undefined,
        definition: formData.definition?.trim() || undefined,
        examples: formData.examples?.trim() || undefined,
        notes: formData.notes?.trim() || undefined,
      };
      const updated = [...userEntries, entry].sort((a, b) => a.word.localeCompare(b.word));
      setUserEntries(updated);
      await persistEntries(updated);
    }

    handleCloseDialog();
  };

  const handleDeleteEntry = async (id: string) => {
    const updated = userEntries.filter((e) => e.id !== id);
    setUserEntries(updated);
    if (expandedId === id) setExpandedId(null);
    await persistEntries(updated);
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // Filtered entries
  const filteredEntries = userEntries.filter(
    (entry) =>
      entry.word.toLowerCase().includes(activeSearchQuery.toLowerCase()) ||
      entry.reading?.toLowerCase().includes(activeSearchQuery.toLowerCase()) ||
      entry.definition?.toLowerCase().includes(activeSearchQuery.toLowerCase()),
  );

  return (
    <div className="h-full bg-background-secondary border-r border-border flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-foreground">辞書</h2>
          <BookOpen className="w-5 h-5 text-foreground-secondary" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-background rounded-md p-1 mb-3">
          <button
            onClick={() => setActiveTab("web")}
            className={`flex-1 px-2 py-1.5 text-sm font-medium rounded transition-colors ${
              activeTab === "web"
                ? "bg-accent text-accent-foreground"
                : "text-foreground-secondary hover:text-foreground hover:bg-hover"
            }`}
          >
            Web辞書
          </button>
          <button
            onClick={() => setActiveTab("user")}
            className={`flex-1 px-2 py-1.5 text-sm font-medium rounded transition-colors ${
              activeTab === "user"
                ? "bg-accent text-accent-foreground"
                : "text-foreground-secondary hover:text-foreground hover:bg-hover"
            }`}
          >
            ユーザー辞書
          </button>
        </div>

        {/* Global Search */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setActiveSearchQuery(globalSearchQuery.trim());
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            placeholder="検索語を入力..."
            value={globalSearchQuery}
            onChange={(e) => setGlobalSearchQuery(e.target.value)}
            className="flex-1 px-3 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="submit"
            disabled={!globalSearchQuery.trim()}
            className="px-3 py-1.5 bg-accent text-accent-foreground rounded hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Search className="w-4 h-4" />
          </button>
        </form>
        {activeSearchQuery && (
          <div className="text-xs text-foreground-secondary mt-2">
            検索中: 「{activeSearchQuery}」
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "user" ? (
          /* User dictionary tab */
          <div className="flex flex-col h-full">
            {/* Add Button */}
            <div className="p-4 border-b border-border">
              <button
                onClick={handleOpenAddDialog}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-accent text-accent-foreground rounded hover:bg-accent/90 transition-colors text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                新しい項目を追加
              </button>
            </div>

            {/* Entries List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {filteredEntries.length === 0 ? (
                <div className="text-center py-8 text-foreground-secondary text-sm">
                  {activeSearchQuery ? (
                    <p>「{activeSearchQuery}」に一致する項目が見つかりません</p>
                  ) : (
                    <>
                      <p>まだ辞書項目が追加されていません</p>
                      <p className="mt-1 text-xs">「新しい項目を追加」ボタンで追加できます</p>
                    </>
                  )}
                </div>
              ) : (
                filteredEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="bg-background-elevated border border-border rounded-lg overflow-hidden"
                  >
                    {/* Header */}
                    <div
                      className="p-3 cursor-pointer hover:bg-hover transition-colors"
                      onClick={() => toggleExpand(entry.id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          {expandedId === entry.id ? (
                            <ChevronDown className="w-4 h-4 text-foreground-secondary flex-shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-foreground-secondary flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <h3 className="font-semibold text-foreground">
                                {entry.word}
                              </h3>
                              {entry.reading && (
                                <span className="text-sm text-foreground-tertiary">
                                  {entry.reading}
                                </span>
                              )}
                              {entry.partOfSpeech && (
                                <span className="text-xs px-1.5 py-0.5 bg-background rounded text-foreground-tertiary">
                                  {entry.partOfSpeech}
                                </span>
                              )}
                            </div>
                            {entry.definition && (
                              <p className="text-sm text-foreground-secondary mt-1 line-clamp-1">
                                {entry.definition}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 ml-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditDialog(entry);
                            }}
                            className="p-1 hover:bg-background rounded text-foreground-tertiary hover:text-foreground transition-colors"
                            title="編集"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeleteEntry(entry.id);
                            }}
                            className="p-1 hover:bg-background rounded text-foreground-tertiary hover:text-danger transition-colors"
                            title="削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {expandedId === entry.id && (
                      <div className="border-t border-border p-3 space-y-3 bg-background">
                        {entry.definition && (
                          <div>
                            <h4 className="text-xs font-semibold text-foreground-secondary mb-1">
                              意味
                            </h4>
                            <p className="text-sm text-foreground whitespace-pre-wrap">
                              {entry.definition}
                            </p>
                          </div>
                        )}

                        {entry.examples && (
                          <div>
                            <h4 className="text-xs font-semibold text-foreground-secondary mb-1">
                              用例
                            </h4>
                            <p className="text-sm text-foreground whitespace-pre-wrap">
                              {entry.examples}
                            </p>
                          </div>
                        )}

                        {entry.notes && (
                          <div>
                            <h4 className="text-xs font-semibold text-foreground-secondary mb-1">
                              メモ
                            </h4>
                            <p className="text-sm text-foreground whitespace-pre-wrap">
                              {entry.notes}
                            </p>
                          </div>
                        )}

                        {!entry.definition && !entry.examples && !entry.notes && (
                          <p className="text-sm text-foreground-tertiary">
                            詳細情報はありません
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Stats */}
            {userEntries.length > 0 && (
              <div className="border-t border-border p-3 bg-background-elevated">
                <div className="text-xs text-foreground-secondary">
                  合計: {userEntries.length} 項目
                  {activeSearchQuery && filteredEntries.length !== userEntries.length && (
                    <span className="ml-2">
                      ({filteredEntries.length} 件表示中)
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Web dictionary tab */
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {!activeSearchQuery ? (
                <div className="text-center py-8 text-foreground-secondary text-sm">
                  <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>検索語を入力してWeb辞書を検索</p>
                  <p className="mt-1 text-xs">
                    {WEB_DICTIONARIES.map(d => d.name).join("、")}で検索します
                  </p>
                </div>
              ) : (
                WEB_DICTIONARIES.map((dict) => {
                  const searchUrl = dict.urlTemplate.replace("{query}", encodeURIComponent(activeSearchQuery));

                  const handleOpenDictionary = () => {
                    if (isElectron() && window.electronAPI?.openDictionaryPopup) {
                      window.electronAPI.openDictionaryPopup(searchUrl, `${dict.name} - ${activeSearchQuery}`);
                    } else {
                      window.open(searchUrl, "_blank", "noopener,noreferrer");
                    }
                  };

                  return (
                    <button
                      key={dict.id}
                      onClick={handleOpenDictionary}
                      className="w-full bg-background-elevated border border-border rounded-lg p-4 hover:bg-hover transition-colors text-left flex items-center gap-3"
                    >
                      <Globe className="w-5 h-5 text-foreground-secondary flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-foreground">{dict.name}</div>
                        <div className="text-xs text-foreground-tertiary truncate mt-0.5">
                          {searchUrl}
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-foreground-tertiary flex-shrink-0" />
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal Dialog */}
      <GlassDialog
        isOpen={isDialogOpen}
        onBackdropClick={handleCloseDialog}
        ariaLabel={editingEntry ? "辞書項目を編集" : "新しい辞書項目を追加"}
        panelClassName="mx-4 w-full max-w-lg p-6"
      >
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-foreground">
            {editingEntry ? "辞書項目を編集" : "新しい辞書項目を追加"}
          </h3>

          <div className="space-y-3">
            {/* Word (required) */}
            <div>
              <label className="text-xs font-medium text-foreground-secondary mb-1 block">
                見出し語 *
              </label>
              <input
                type="text"
                placeholder="例: 幻想"
                value={formData.word || ""}
                onChange={(e) => setFormData({ ...formData, word: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                autoFocus
              />
            </div>

            {/* Reading */}
            <div>
              <label className="text-xs font-medium text-foreground-secondary mb-1 block">
                読み方
              </label>
              <input
                type="text"
                placeholder="例: げんそう"
                value={formData.reading || ""}
                onChange={(e) => setFormData({ ...formData, reading: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            {/* POS - Dropdown */}
            <div>
              <label className="text-xs font-medium text-foreground-secondary mb-1 block">
                品詞
              </label>
              <select
                value={formData.partOfSpeech || ""}
                onChange={(e) => setFormData({ ...formData, partOfSpeech: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="">選択してください</option>
                {POS_OPTIONS.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>
            </div>

            {/* Definition (optional) */}
            <div>
              <label className="text-xs font-medium text-foreground-secondary mb-1 block">
                意味
              </label>
              <textarea
                placeholder="この言葉の意味を入力してください"
                value={formData.definition || ""}
                onChange={(e) => setFormData({ ...formData, definition: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent resize-none"
                rows={3}
              />
            </div>

            {/* Examples */}
            <div>
              <label className="text-xs font-medium text-foreground-secondary mb-1 block">
                用例
              </label>
              <textarea
                placeholder="使用例を入力してください"
                value={formData.examples || ""}
                onChange={(e) => setFormData({ ...formData, examples: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent resize-none"
                rows={2}
              />
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-medium text-foreground-secondary mb-1 block">
                メモ
              </label>
              <textarea
                placeholder="メモや補足情報を入力してください"
                value={formData.notes || ""}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent resize-none"
                rows={2}
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={handleCloseDialog}
              className="px-4 py-2 text-sm text-foreground-secondary hover:text-foreground transition-colors rounded hover:bg-hover"
            >
              キャンセル
            </button>
            <button
              onClick={() => void handleSaveEntry()}
              disabled={!formData.word?.trim()}
              className="px-4 py-2 text-sm bg-accent text-accent-foreground rounded hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editingEntry ? "保存" : "追加"}
            </button>
          </div>
        </div>
      </GlassDialog>
    </div>
  );
}

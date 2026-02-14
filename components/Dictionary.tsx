"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Edit2, Check, X, BookOpen, ChevronDown, ChevronRight, Search, Globe, ExternalLink } from "lucide-react";

// ユーザー辞書條目
interface UserDictionaryEntry {
  id: string;
  word: string;
  reading?: string;
  partOfSpeech?: string;
  definition: string;
  examples?: string;
  notes?: string;
}

// Web辞典ソース
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

// Electron環境かどうかを判定
const isElectron = (): boolean => {
  return typeof window !== "undefined" &&
    typeof window.process !== "undefined" &&
    window.process?.type === "renderer";
};

interface DictionaryProps {
  content?: string;
  initialSearchTerm?: string;
  searchTriggerId?: number;
}

export default function Dictionary({ content, initialSearchTerm, searchTriggerId }: DictionaryProps) {
  const [activeTab, setActiveTab] = useState<"user" | "web">("web");
  const [userEntries, setUserEntries] = useState<UserDictionaryEntry[]>([]);
  const [isAddingEntry, setIsAddingEntry] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newEntry, setNewEntry] = useState<Partial<UserDictionaryEntry>>({
    word: "",
    reading: "",
    partOfSpeech: "",
    definition: "",
    examples: "",
    notes: "",
  });

  // グローバル検索用の状態（全タブ共有）
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [activeSearchQuery, setActiveSearchQuery] = useState("");

  // initialSearchTerm が変わったら検索を実行
  useEffect(() => {
    if (initialSearchTerm && searchTriggerId) {
      setGlobalSearchQuery(initialSearchTerm);
      setActiveSearchQuery(initialSearchTerm);
    }
  }, [initialSearchTerm, searchTriggerId]);

  const handleAddEntry = () => {
    if (!newEntry.word?.trim() || !newEntry.definition?.trim()) return;

    const entry: UserDictionaryEntry = {
      id: Date.now().toString(),
      word: newEntry.word.trim(),
      reading: newEntry.reading?.trim() || "",
      partOfSpeech: newEntry.partOfSpeech?.trim() || "",
      definition: newEntry.definition.trim(),
      examples: newEntry.examples?.trim() || "",
      notes: newEntry.notes?.trim() || "",
    };

    setUserEntries([...userEntries, entry].sort((a, b) => a.word.localeCompare(b.word)));
    setNewEntry({
      word: "",
      reading: "",
      partOfSpeech: "",
      definition: "",
      examples: "",
      notes: "",
    });
    setIsAddingEntry(false);
  };

  const handleDeleteEntry = (id: string) => {
    setUserEntries(userEntries.filter((e) => e.id !== id));
    if (expandedId === id) setExpandedId(null);
    if (editingId === id) setEditingId(null);
  };

  const handleUpdateEntry = (id: string, updates: Partial<UserDictionaryEntry>) => {
    setUserEntries(
      userEntries.map((e) => (e.id === id ? { ...e, ...updates } : e))
    );
  };

  const handleCancelAdd = () => {
    setIsAddingEntry(false);
    setNewEntry({
      word: "",
      reading: "",
      partOfSpeech: "",
      definition: "",
      examples: "",
      notes: "",
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // ユーザー辞書のフィルタリング（activeSearchQueryを使用）
  const filteredEntries = userEntries.filter(
    (entry) =>
      entry.word.toLowerCase().includes(activeSearchQuery.toLowerCase()) ||
      entry.reading?.toLowerCase().includes(activeSearchQuery.toLowerCase()) ||
      entry.definition.toLowerCase().includes(activeSearchQuery.toLowerCase())
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
          /* ユーザー辞書タブ */
          <div className="flex flex-col h-full">
            {/* Add Button */}
            <div className="p-4 border-b border-border">
              <button
                onClick={() => setIsAddingEntry(true)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-accent text-accent-foreground rounded hover:bg-accent/90 transition-colors text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                新しい項目を追加
              </button>
            </div>

            {/* Entries List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {/* 新規追加フォーム */}
              {isAddingEntry && (
                <div className="bg-background-elevated border border-border rounded-lg p-3 space-y-2 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-foreground">新しい項目</h3>
                    <div className="flex gap-1">
                      <button
                        onClick={handleAddEntry}
                        className="p-1 hover:bg-hover rounded text-success"
                        title="追加"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleCancelAdd}
                        className="p-1 hover:bg-hover rounded text-foreground-secondary"
                        title="キャンセル"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <label className="text-xs font-medium text-foreground-secondary mb-1 block">
                        見出し語 *
                      </label>
                      <input
                        type="text"
                        placeholder="例: 幻想"
                        value={newEntry.word || ""}
                        onChange={(e) =>
                          setNewEntry({ ...newEntry, word: e.target.value })
                        }
                        className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                        autoFocus
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-foreground-secondary mb-1 block">
                        読み方
                      </label>
                      <input
                        type="text"
                        placeholder="例: げんそう"
                        value={newEntry.reading || ""}
                        onChange={(e) =>
                          setNewEntry({ ...newEntry, reading: e.target.value })
                        }
                        className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-foreground-secondary mb-1 block">
                        品詞
                      </label>
                      <input
                        type="text"
                        placeholder="例: 名詞"
                        value={newEntry.partOfSpeech || ""}
                        onChange={(e) =>
                          setNewEntry({ ...newEntry, partOfSpeech: e.target.value })
                        }
                        className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-foreground-secondary mb-1 block">
                        意味 *
                      </label>
                      <textarea
                        placeholder="この言葉の意味を入力してください"
                        value={newEntry.definition || ""}
                        onChange={(e) =>
                          setNewEntry({ ...newEntry, definition: e.target.value })
                        }
                        className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent resize-none"
                        rows={3}
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-foreground-secondary mb-1 block">
                        用例
                      </label>
                      <textarea
                        placeholder="使用例を入力してください"
                        value={newEntry.examples || ""}
                        onChange={(e) =>
                          setNewEntry({ ...newEntry, examples: e.target.value })
                        }
                        className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent resize-none"
                        rows={2}
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-foreground-secondary mb-1 block">
                        メモ
                      </label>
                      <textarea
                        placeholder="メモや補足情報を入力してください"
                        value={newEntry.notes || ""}
                        onChange={(e) =>
                          setNewEntry({ ...newEntry, notes: e.target.value })
                        }
                        className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent resize-none"
                        rows={2}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* エントリーリスト */}
              {filteredEntries.length === 0 && !isAddingEntry ? (
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
                            <p className="text-sm text-foreground-secondary mt-1 line-clamp-1">
                              {entry.definition}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteEntry(entry.id);
                          }}
                          className="p-1 hover:bg-background rounded text-foreground-tertiary hover:text-danger transition-colors ml-2"
                          title="削除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {expandedId === entry.id && (
                      <div className="border-t border-border p-3 space-y-3 bg-background">
                        {editingId === entry.id ? (
                          // Edit Mode
                          <div className="space-y-2">
                            <div className="flex justify-end gap-1 mb-2">
                              <button
                                onClick={() => setEditingId(null)}
                                className="p-1 hover:bg-hover rounded text-success"
                                title="完了"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            </div>

                            <div>
                              <label className="text-xs font-medium text-foreground-secondary mb-1 block">
                                見出し語
                              </label>
                              <input
                                type="text"
                                value={entry.word}
                                onChange={(e) =>
                                  handleUpdateEntry(entry.id, { word: e.target.value })
                                }
                                className="w-full px-2 py-1.5 bg-background-elevated border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                              />
                            </div>

                            <div>
                              <label className="text-xs font-medium text-foreground-secondary mb-1 block">
                                読み方
                              </label>
                              <input
                                type="text"
                                value={entry.reading}
                                onChange={(e) =>
                                  handleUpdateEntry(entry.id, { reading: e.target.value })
                                }
                                className="w-full px-2 py-1.5 bg-background-elevated border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                              />
                            </div>

                            <div>
                              <label className="text-xs font-medium text-foreground-secondary mb-1 block">
                                品詞
                              </label>
                              <input
                                type="text"
                                value={entry.partOfSpeech}
                                onChange={(e) =>
                                  handleUpdateEntry(entry.id, {
                                    partOfSpeech: e.target.value,
                                  })
                                }
                                className="w-full px-2 py-1.5 bg-background-elevated border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                              />
                            </div>

                            <div>
                              <label className="text-xs font-medium text-foreground-secondary mb-1 block">
                                意味
                              </label>
                              <textarea
                                value={entry.definition}
                                onChange={(e) =>
                                  handleUpdateEntry(entry.id, {
                                    definition: e.target.value,
                                  })
                                }
                                className="w-full px-2 py-1.5 bg-background-elevated border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent resize-none"
                                rows={3}
                              />
                            </div>

                            <div>
                              <label className="text-xs font-medium text-foreground-secondary mb-1 block">
                                用例
                              </label>
                              <textarea
                                value={entry.examples}
                                onChange={(e) =>
                                  handleUpdateEntry(entry.id, {
                                    examples: e.target.value,
                                  })
                                }
                                className="w-full px-2 py-1.5 bg-background-elevated border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent resize-none"
                                rows={2}
                              />
                            </div>

                            <div>
                              <label className="text-xs font-medium text-foreground-secondary mb-1 block">
                                メモ
                              </label>
                              <textarea
                                value={entry.notes}
                                onChange={(e) =>
                                  handleUpdateEntry(entry.id, { notes: e.target.value })
                                }
                                className="w-full px-2 py-1.5 bg-background-elevated border border-border rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent resize-none"
                                rows={2}
                              />
                            </div>
                          </div>
                        ) : (
                          // View Mode
                          <div className="space-y-3">
                            <div className="flex justify-end">
                              <button
                                onClick={() => setEditingId(entry.id)}
                                className="p-1 hover:bg-hover rounded text-foreground-secondary hover:text-foreground"
                                title="編集"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div>
                              <h4 className="text-xs font-semibold text-foreground-secondary mb-1">
                                意味
                              </h4>
                              <p className="text-sm text-foreground whitespace-pre-wrap">
                                {entry.definition}
                              </p>
                            </div>

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
                          </div>
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
          /* Web辞書タブ */
          <div className="flex flex-col h-full">
            {/* Dictionary Sources */}
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

                  // Open dictionary in popup window (Electron) or new tab (Web)
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
    </div>
  );
}

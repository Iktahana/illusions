/**
 * VersionHistoryPanel Component
 * 
 * Displays Git commit history with diff viewer.
 */

"use client";

import { useState } from "react";
import { useGitHistory } from "@/lib/hooks/use-git-history";
import { History, Tag, GitBranch, RotateCcw, Eye, X } from "lucide-react";
import DiffViewer from "./DiffViewer";

interface VersionHistoryPanelProps {
  projectId: string;
  currentContent: string;
  onRestore?: (content: string) => void;
}

export default function VersionHistoryPanel({
  projectId,
  currentContent,
  onRestore,
}: VersionHistoryPanelProps) {
  const { commits, tags, isLoading, error, readFileAtCommit, createTag } = useGitHistory(projectId);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [selectedContent, setSelectedContent] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [showTagDialog, setShowTagDialog] = useState(false);

  const handleViewCommit = async (commitHash: string) => {
    try {
      const content = await readFileAtCommit(commitHash, "novel.mdi");
      setSelectedCommit(commitHash);
      setSelectedContent(content);
      setShowDiff(true);
    } catch (err) {
      console.error("Failed to read commit:", err);
    }
  };

  const handleRestore = () => {
    if (selectedContent && onRestore) {
      if (window.confirm("現在の内容を選択したバージョンに戻しますか？未保存の変更は失われます。")) {
        onRestore(selectedContent);
        setShowDiff(false);
        setSelectedCommit(null);
        setSelectedContent(null);
      }
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "たった今";
    if (minutes < 60) return `${minutes}分前`;
    if (hours < 24) return `${hours}時間前`;
    if (days < 7) return `${days}日前`;
    return formatDate(timestamp);
  };

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-foreground-secondary">
        履歴を読み込み中...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-600 dark:text-red-400">
        {error}
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="p-8 text-center text-foreground-secondary">
        <History size={48} className="mx-auto opacity-50 mb-3" />
        <div>バージョン履歴がありません</div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <History size={16} />
            バージョン履歴
          </div>
          <button
            onClick={() => setShowTagDialog(true)}
            className="text-xs px-2 py-1 border border-border hover:bg-hover rounded"
          >
            <Tag size={12} className="inline mr-1" />
            タグを作成
          </button>
        </div>

        {/* Commits list */}
        <div className="flex-1 overflow-y-auto">
          {commits.map((commit, index) => {
            const isLatest = index === 0;
            const commitTags = tags.filter((tag) => tag.commitHash === commit.oid);

            return (
              <div
                key={commit.oid}
                className={`p-3 border-b border-border hover:bg-hover/50 transition-colors ${
                  selectedCommit === commit.oid ? "bg-accent/10" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    <div className="w-3 h-3 rounded-full bg-accent" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="text-sm font-medium text-foreground truncate">
                        {commit.message}
                      </div>
                      {isLatest && (
                        <span className="text-xs px-1.5 py-0.5 bg-accent text-accent-foreground rounded">
                          HEAD
                        </span>
                      )}
                    </div>

                    {commitTags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1">
                        {commitTags.map((tag) => (
                          <span
                            key={tag.name}
                            className="text-xs px-1.5 py-0.5 bg-background-secondary border border-border rounded flex items-center gap-1"
                          >
                            <Tag size={10} />
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="text-xs text-foreground-tertiary mb-2">
                      {commit.author.name} • {formatRelativeTime(commit.timestamp)}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleViewCommit(commit.oid)}
                        className="text-xs px-2 py-1 border border-border hover:bg-hover rounded flex items-center gap-1"
                      >
                        <Eye size={12} />
                        差分を表示
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Diff viewer modal */}
      {showDiff && selectedContent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowDiff(false)}>
          <div
            className="bg-background border border-border rounded-lg w-full max-w-4xl h-[80vh] mx-4 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b border-border flex items-center justify-between">
              <div className="text-sm font-medium">差分表示</div>
              <div className="flex items-center gap-2">
                {onRestore && (
                  <button
                    onClick={handleRestore}
                    className="text-sm px-3 py-1.5 bg-accent text-accent-foreground hover:bg-accent/90 rounded flex items-center gap-1"
                  >
                    <RotateCcw size={14} />
                    このバージョンに戻す
                  </button>
                )}
                <button
                  onClick={() => setShowDiff(false)}
                  className="p-1.5 hover:bg-hover rounded"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <DiffViewer
                oldContent={selectedContent}
                newContent={currentContent}
                oldLabel="選択したバージョン"
                newLabel="現在のバージョン"
              />
            </div>
          </div>
        </div>
      )}

      {/* Create tag dialog */}
      {showTagDialog && (
        <CreateTagDialog
          onClose={() => setShowTagDialog(false)}
          onCreate={async (name, message) => {
            await createTag(name, message);
            setShowTagDialog(false);
          }}
        />
      )}
    </>
  );
}

// Create Tag Dialog
interface CreateTagDialogProps {
  onClose: () => void;
  onCreate: (name: string, message: string) => Promise<void>;
}

function CreateTagDialog({ onClose, onCreate }: CreateTagDialogProps) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;

    setIsCreating(true);
    try {
      await onCreate(name.trim(), message.trim());
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-background border border-border rounded-lg p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4">タグを作成</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">タグ名</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: v1.0, 初稿完成"
              className="w-full px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-accent"
              autoFocus
              disabled={isCreating}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">メッセージ（任意）</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="このタグについての説明..."
              rows={3}
              className="w-full px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-accent resize-none"
              disabled={isCreating}
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              disabled={isCreating}
              className="px-4 py-2 text-sm border border-border rounded-md hover:bg-hover disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              onClick={handleCreate}
              disabled={!name.trim() || isCreating}
              className="px-4 py-2 text-sm bg-accent text-accent-foreground rounded-md hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? "作成中..." : "作成"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

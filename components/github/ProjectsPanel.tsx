/**
 * ProjectsPanel Component
 * 
 * Displays and manages novel projects (local and GitHub).
 */

"use client";

import { useState } from "react";
import { useProjects } from "@/lib/hooks/use-projects";
import { useGitHubAuth } from "@/lib/hooks/use-github-auth";
import { FolderOpen, FilePlus, Github, HardDrive, Upload, Trash2, ExternalLink } from "lucide-react";
import clsx from "clsx";

export default function ProjectsPanel() {
  const { projects, isLoading, error, createLocalProject, uploadToGitHub, importFromGitHub, deleteProject } = useProjects();
  const { isAuthenticated } = useGitHubAuth();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-foreground-secondary">
        プロジェクトを読み込み中...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-border space-y-2">
        <button
          onClick={() => setShowCreateDialog(true)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-accent text-accent-foreground hover:bg-accent/90 rounded-md text-sm font-medium transition-colors"
        >
          <FilePlus size={16} />
          新規プロジェクト
        </button>

        {isAuthenticated && (
          <button
            onClick={() => setShowImportDialog(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-border hover:bg-hover rounded-md text-sm transition-colors"
          >
            <FolderOpen size={16} />
            GitHub から読み込む
          </button>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="m-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Projects list */}
      <div className="flex-1 overflow-y-auto">
        {projects.length === 0 ? (
          <div className="p-8 text-center text-foreground-secondary space-y-3">
            <FilePlus size={48} className="mx-auto opacity-50" />
            <div>
              <div className="font-medium">プロジェクトがありません</div>
              <div className="text-sm mt-1">
                「新規プロジェクト」をクリックして始めましょう
              </div>
            </div>
          </div>
        ) : (
          projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              isAuthenticated={isAuthenticated}
              onUploadToGitHub={async (repoName) => {
                setActionInProgress(true);
                try {
                  await uploadToGitHub(project.id, repoName);
                } finally {
                  setActionInProgress(false);
                }
              }}
              onDelete={async () => {
                if (window.confirm(`「${project.name}」を削除しますか？`)) {
                  await deleteProject(project.id);
                }
              }}
              disabled={actionInProgress}
            />
          ))
        )}
      </div>

      {/* Create Dialog */}
      {showCreateDialog && (
        <CreateProjectDialog
          onClose={() => setShowCreateDialog(false)}
          onCreate={async (name) => {
            setActionInProgress(true);
            try {
              await createLocalProject(name);
              setShowCreateDialog(false);
            } finally {
              setActionInProgress(false);
            }
          }}
        />
      )}

      {/* Import Dialog */}
      {showImportDialog && (
        <ImportProjectDialog
          onClose={() => setShowImportDialog(false)}
          onImport={async (repoName) => {
            setActionInProgress(true);
            try {
              await importFromGitHub(repoName);
              setShowImportDialog(false);
            } finally {
              setActionInProgress(false);
            }
          }}
        />
      )}
    </div>
  );
}

// Project Card Component
interface ProjectCardProps {
  project: any;
  isAuthenticated: boolean;
  onUploadToGitHub: (repoName: string) => Promise<void>;
  onDelete: () => Promise<void>;
  disabled?: boolean;
}

function ProjectCard({ project, isAuthenticated, onUploadToGitHub, onDelete, disabled }: ProjectCardProps) {
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const isGitHub = project.type === "github";

  const formatDate = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "たった今";
    if (minutes < 60) return `${minutes}分前`;
    if (hours < 24) return `${hours}時間前`;
    if (days < 7) return `${days}日前`;
    return new Date(timestamp).toLocaleDateString("ja-JP");
  };

  return (
    <div className="p-3 border-b border-border hover:bg-hover/50 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1">
          {isGitHub ? (
            <Github size={18} className="text-foreground-secondary" />
          ) : (
            <HardDrive size={18} className="text-foreground-secondary" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-medium text-foreground truncate">{project.name}</div>

          {isGitHub && project.githubRepo && (
            <a
              href={project.githubRepo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-accent hover:underline flex items-center gap-1 mt-0.5"
            >
              {project.githubRepo.fullName}
              <ExternalLink size={12} />
            </a>
          )}

          <div className="text-xs text-foreground-tertiary mt-1 space-x-2">
            <span>{project.metadata.charCount.toLocaleString()} 字</span>
            <span>•</span>
            <span>{formatDate(project.metadata.updatedAt)}</span>
          </div>

          <div className="flex gap-2 mt-2">
            {!isGitHub && isAuthenticated && (
              <button
                onClick={() => setShowUploadDialog(true)}
                disabled={disabled}
                className="text-xs px-2 py-1 border border-border hover:bg-hover rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload size={12} className="inline mr-1" />
                GitHub へ
              </button>
            )}

            <button
              onClick={onDelete}
              disabled={disabled}
              className="text-xs px-2 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 size={12} className="inline mr-1" />
              削除
            </button>
          </div>
        </div>
      </div>

      {showUploadDialog && (
        <UploadDialog
          projectName={project.name}
          onClose={() => setShowUploadDialog(false)}
          onUpload={onUploadToGitHub}
        />
      )}
    </div>
  );
}

// Create Project Dialog
interface CreateProjectDialogProps {
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}

function CreateProjectDialog({ onClose, onCreate }: CreateProjectDialogProps) {
  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;

    setIsCreating(true);
    try {
      await onCreate(name.trim());
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-background border border-border rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">新規プロジェクト</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">プロジェクト名</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="例: 春の雪"
              className="w-full px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-accent"
              autoFocus
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

// Import Project Dialog
interface ImportProjectDialogProps {
  onClose: () => void;
  onImport: (repoName: string) => Promise<void>;
}

function ImportProjectDialog({ onClose, onImport }: ImportProjectDialogProps) {
  const [repoName, setRepoName] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  const handleImport = async () => {
    if (!repoName.trim()) return;

    setIsImporting(true);
    try {
      await onImport(repoName.trim());
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-background border border-border rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">GitHub から読み込む</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">リポジトリ</label>
            <input
              type="text"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleImport()}
              placeholder="例: username/novel-project"
              className="w-full px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-accent"
              autoFocus
              disabled={isImporting}
            />
            <p className="text-xs text-foreground-tertiary mt-1">
              形式: owner/repository
            </p>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              disabled={isImporting}
              className="px-4 py-2 text-sm border border-border rounded-md hover:bg-hover disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              onClick={handleImport}
              disabled={!repoName.trim() || isImporting}
              className="px-4 py-2 text-sm bg-accent text-accent-foreground rounded-md hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isImporting ? "読み込み中..." : "読み込む"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Upload Dialog
interface UploadDialogProps {
  projectName: string;
  onClose: () => void;
  onUpload: (repoName: string) => Promise<void>;
}

function UploadDialog({ projectName, onClose, onUpload }: UploadDialogProps) {
  const [repoName, setRepoName] = useState(projectName.replace(/\s+/g, "-").toLowerCase());
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async () => {
    if (!repoName.trim()) return;

    setIsUploading(true);
    try {
      await onUpload(repoName.trim());
      onClose();
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-background border border-border rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">GitHub へアップロード</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">リポジトリ名</label>
            <input
              type="text"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUpload()}
              placeholder="例: my-novel"
              className="w-full px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-accent"
              autoFocus
              disabled={isUploading}
            />
            <p className="text-xs text-foreground-tertiary mt-1">
              英数字、ハイフン、アンダースコアのみ使用できます
            </p>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2 text-sm border border-border rounded-md hover:bg-hover disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              onClick={handleUpload}
              disabled={!repoName.trim() || isUploading}
              className="px-4 py-2 text-sm bg-accent text-accent-foreground rounded-md hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? "アップロード中..." : "アップロード"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

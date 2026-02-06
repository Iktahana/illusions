# Illusions プロジェクトディレクトリ移行計画

**作成日**: 2026-02-06  
**バージョン**: 1.0.0  
**ステータス**: 📋 Planning Phase

---

## 📌 エグゼクティブサマリー

Illusionsを**単一ファイル(.mdi)管理**から**プロジェクトディレクトリ管理**へ移行し、履歴管理・アセット管理・ワークスペース機能を提供する。VS Codeのように、単一ファイルを直接開く「スタンドアロンモード」も引き続きサポートし、ユーザーの選択肢を維持する。

### 主要目標

1. **プロジェクトモード**: 1プロジェクト = 1ディレクトリとして管理
2. **履歴管理**: 自動スナップショットによるバージョン管理
3. **後方互換性**: 既存の単一ファイルユーザーへの影響を最小化
4. **クロスプラットフォーム**: Web (File System Access API) と Electron (Node.js fs) の両対応
5. **マルチフォーマット**: .mdi / .md / .txt の3形式をサポート

### 開発期間

**18週間（約4.5ヶ月）** - 4フェーズに分割

---

## 🗂️ 目次

1. [データ構造の設計](#1-データ構造の設計)
2. [技術的な実装ステップ](#2-技術的な実装ステップ)
3. [UI/UX フローの設計](#3-uiux-フローの設計)
4. [潜在的な課題と解決策](#4-潜在的な課題と解決策)
5. [段階的ロードマップ](#5-段階的ロードマップ)
6. [成功指標 (KPI)](#6-成功指標-kpi)

---

## 1. データ構造の設計

### 1.1 推奨プロジェクトディレクトリ構造

```
my-novel/                          # プロジェクトルート (FileSystemDirectoryHandle)
├── main.mdi                       # メインドキュメント（.mdi / .md / .txt）
├── .illusions/                    # アプリメタデータディレクトリ
│   ├── project.json               # プロジェクト設定
│   ├── workspace.json             # エディタ状態（カーソル位置、スクロール等）
│   └── history/                   # 履歴管理
│       ├── index.json             # 履歴インデックス
│       ├── main.mdi.[202602011030].history
│       └── main.mdi.[202602011145].history
├── assets/                        # アセットディレクトリ（将来用）
│   ├── images/
│   └── references/
├── exports/                       # エクスポート出力（将来用）
│   ├── manuscript.pdf
│   └── manuscript.epub
└── .gitignore                     # 自動生成（.illusionsを除外）
```

### 1.2 メタデータファイル仕様

#### `.illusions/project.json`

```typescript
interface ProjectMetadata {
  version: "1.0.0";                    // メタデータスキーマバージョン
  projectId: string;                   // UUID v4
  name: string;                        // プロジェクト名
  mainFile: string;                    // "main.mdi" | "main.md" | "main.txt"
  mainFileExtension: ".mdi" | ".md" | ".txt";
  createdAt: number;                   // Unixタイムスタンプ
  lastModified: number;
  author?: string;
  description?: string;
  tags?: string[];
  
  editorSettings: {
    fontScale: number;
    lineHeight: number;
    paragraphSpacing: number;
    textIndent: number;
    fontFamily: string;
    charsPerLine: number;
    showParagraphNumbers: boolean;
    mdiExtensionsEnabled: boolean;     // .mdiの場合のみtrue
    posHighlightEnabled: boolean;
    posHighlightColors: Record<string, string>;
  };
}
```

#### `.illusions/workspace.json`

```typescript
interface WorkspaceState {
  editorState: {
    cursorPosition: number;            // ProseMirror doc position
    scrollTop: number;
    selectionStart?: number;
    selectionEnd?: number;
  };
  lastOpenedAt: number;
  viewState: {
    activeView: "chapters" | "settings" | "style";
    inspectorTab: "ai" | "corrections" | "stats";
    isLeftPanelCollapsed: boolean;
    isRightPanelCollapsed: boolean;
  };
}
```

#### `.illusions/history/index.json`

```typescript
interface HistoryIndex {
  snapshots: Array<{
    id: string;                        // UUID
    timestamp: number;
    filename: string;                  // "main.mdi.[202602061430].history"
    sourceFile: string;                // "main.mdi"
    type: "auto" | "manual" | "milestone";
    label?: string;                    // ユーザー定義ラベル
    characterCount: number;
    fileSize: number;
    checksum?: string;                 // SHA-256ハッシュ
  }>;
  maxSnapshots: number;                // デフォルト100
  retentionDays: number;               // デフォルト90日
}
```

**履歴ファイル命名規則**:

```
{元ファイル名}.[YYYYMMDDHHmm].history

例:
- 雪女.mdi.[202601011520].history
- main.md.[202602061430].history
- draft.txt.[202602051600].history
```

### 1.3 アプリ内状態管理の拡張

#### プロジェクトモードとスタンドアロンモードの定義

```typescript
// lib/project-types.ts

/**
 * プロジェクトモード: ディレクトリベースの管理
 */
interface ProjectMode {
  type: "project";
  projectId: string;
  name: string;
  rootHandle: FileSystemDirectoryHandle;  // ディレクトリハンドル
  mainFileHandle: FileSystemFileHandle;   // main.mdi/md/txt ハンドル
  metadata: ProjectMetadata;
  workspaceState: WorkspaceState;
}

/**
 * スタンドアロンモード: 単一ファイルの直接編集
 */
interface StandaloneMode {
  type: "standalone";
  fileHandle: FileSystemFileHandle;
  fileName: string;
  fileExtension: ".mdi" | ".md" | ".txt";
  editorSettings: ProjectMetadata["editorSettings"];
}

type EditorMode = ProjectMode | StandaloneMode | null;
```

**判別関数**:

```typescript
function isProjectMode(mode: EditorMode): mode is ProjectMode {
  return mode?.type === "project";
}

function isStandaloneMode(mode: EditorMode): mode is StandaloneMode {
  return mode?.type === "standalone";
}
```

---

## 2. 技術的な実装ステップ

### 2.1 FileSystemHandle の IndexedDB 永続化

#### Dexie スキーマ拡張 (v2)

```typescript
// lib/web-storage.ts

interface ProjectHandleRecord {
  projectId: string;                   // Primary key
  rootHandle: FileSystemDirectoryHandle;
  lastAccessedAt: number;
  permissionState: PermissionState;
}

class IllusionsDatabase extends Dexie {
  appState!: Table<AppStateRecord>;
  recentFiles!: Table<RecentFileRecord>;
  editorBuffer!: Table<EditorBufferRecord>;
  projectHandles!: Table<ProjectHandleRecord>;  // 新規追加

  constructor() {
    super("IllusionsStorage");
    
    this.version(2).stores({
      appState: "id",
      recentFiles: "path, lastModified",
      editorBuffer: "id",
      projectHandles: "projectId, lastAccessedAt",
    });
  }
}
```

#### ハンドル復元ロジック

```typescript
// lib/project-manager.ts

export class ProjectManager {
  /**
   * プロジェクトディレクトリハンドルを永続化
   */
  async saveProjectHandle(
    projectId: string, 
    rootHandle: FileSystemDirectoryHandle
  ): Promise<void> {
    const permissionState = await rootHandle.queryPermission({ mode: "readwrite" });
    
    await this.db.projectHandles.put({
      projectId,
      rootHandle,
      lastAccessedAt: Date.now(),
      permissionState,
    });
  }
  
  /**
   * IndexedDBからプロジェクトハンドルを復元
   */
  async restoreProjectHandle(
    projectId: string
  ): Promise<FileSystemDirectoryHandle | null> {
    const record = await this.db.projectHandles.get(projectId);
    if (!record) return null;
    
    const { rootHandle } = record;
    
    // 1. ハンドルの有効性確認
    try {
      await rootHandle.queryPermission({ mode: "read" });
    } catch (error) {
      await this.db.projectHandles.delete(projectId);
      return null;
    }
    
    // 2. 権限の確認と要求
    let permission = await rootHandle.queryPermission({ mode: "readwrite" });
    
    if (permission === "prompt") {
      permission = await rootHandle.requestPermission({ mode: "readwrite" });
    }
    
    if (permission !== "granted") {
      return null;
    }
    
    // 3. 権限状態を更新
    await this.db.projectHandles.update(projectId, {
      permissionState: "granted",
      lastAccessedAt: Date.now(),
    });
    
    return rootHandle;
  }
}
```

### 2.2 仮想ファイルシステム (VFS) レイヤー

#### アーキテクチャ概要

```
┌─────────────────────────────────────────┐
│     React Components (UI Layer)         │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│  VFS Interface (Platform-Agnostic API)  │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
┌───────▼────────┐  ┌───────▼──────────┐
│  Web Provider  │  │ Electron Provider│
│  (FSA API)     │  │  (Node.js fs)    │
└────────────────┘  └──────────────────┘
```

#### VFS インターフェース

```typescript
// lib/vfs/types.ts

export interface VirtualFileSystem {
  // ディレクトリ操作
  openDirectory(): Promise<VFSDirectoryHandle>;
  getDirectoryHandle(path: string): Promise<VFSDirectoryHandle>;
  
  // ファイル操作
  openFile(path: string): Promise<VFSFileHandle>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  
  // メタデータ
  getFileMetadata(path: string): Promise<VFSFileMetadata>;
  listDirectory(path: string): Promise<VFSEntry[]>;
  
  // ファイル監視（オプショナル）
  watchFile?(path: string, callback: (event: VFSWatchEvent) => void): VFSWatcher;
}
```

#### Web実装 (File System Access API)

```typescript
// lib/vfs/web-vfs.ts

export class WebVFS implements VirtualFileSystem {
  private rootHandle: FileSystemDirectoryHandle | null = null;
  
  async openDirectory(): Promise<VFSDirectoryHandle> {
    this.rootHandle = await window.showDirectoryPicker({
      mode: "readwrite",
    });
    return this.wrapDirectoryHandle(this.rootHandle, "/");
  }
  
  async readFile(path: string): Promise<string> {
    const fileHandle = await this.resolvePathToFile(path);
    const file = await fileHandle.getFile();
    return await file.text();
  }
  
  async writeFile(path: string, content: string): Promise<void> {
    const fileHandle = await this.resolvePathToFile(path);
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }
  
  // ... 実装の詳細は本文参照
}
```

#### Electron実装 (Node.js fs)

```typescript
// lib/vfs/electron-vfs.ts

export class ElectronVFS implements VirtualFileSystem {
  private rootPath: string | null = null;
  
  async openDirectory(): Promise<VFSDirectoryHandle> {
    const result = await window.electronAPI.showOpenDialog({
      properties: ["openDirectory"],
    });
    
    if (result.canceled) throw new Error("Cancelled");
    
    this.rootPath = result.filePaths[0];
    return this.getDirectoryHandle("/");
  }
  
  async readFile(path: string): Promise<string> {
    const absolutePath = this.resolvePath(path);
    return await window.electronAPI.readFile(absolutePath);
  }
  
  // ... 実装の詳細は本文参照
}
```

### 2.3 プロジェクトサービス

```typescript
// lib/project-service.ts

export class ProjectService {
  private vfs = getVFS();
  
  /**
   * 新規プロジェクトを作成
   */
  async createProject(
    name: string,
    fileExtension: ".mdi" | ".md" | ".txt" = ".mdi"
  ): Promise<ProjectMode> {
    const rootHandle = await this.vfs.openDirectory();
    const projectId = uuidv4();
    const mainFileName = `main${fileExtension}`;
    
    // プロジェクトメタデータ生成
    const metadata: ProjectMetadata = {
      version: "1.0.0",
      projectId,
      name,
      mainFile: mainFileName,
      mainFileExtension: fileExtension,
      createdAt: Date.now(),
      lastModified: Date.now(),
      editorSettings: this.getDefaultEditorSettings(fileExtension),
    };
    
    // .illusionsディレクトリ作成
    const illusionsDir = await rootHandle.getDirectoryHandle(".illusions", { create: true });
    
    // project.json作成
    const projectFile = await illusionsDir.getFileHandle("project.json", { create: true });
    await projectFile.write(JSON.stringify(metadata, null, 2));
    
    // メインファイル作成
    const mainFile = await rootHandle.getFileHandle(mainFileName, { create: true });
    await mainFile.write(this.getInitialContent(fileExtension));
    
    // workspace.json, historyディレクトリ作成
    const workspaceState = this.getDefaultWorkspaceState();
    const workspaceFile = await illusionsDir.getFileHandle("workspace.json", { create: true });
    await workspaceFile.write(JSON.stringify(workspaceState, null, 2));
    
    await illusionsDir.getDirectoryHandle("history", { create: true });
    
    // .gitignore自動生成
    await this.createGitignore(rootHandle);
    
    // ハンドル永続化
    await this.projectManager.saveProjectHandle(projectId, rootHandle);
    
    return {
      type: "project",
      projectId,
      name,
      rootHandle,
      mainFileHandle: mainFile,
      metadata,
      workspaceState,
    };
  }
  
  /**
   * 既存プロジェクトを開く
   */
  async openProject(): Promise<ProjectMode> {
    const rootHandle = await this.vfs.openDirectory();
    
    // .illusions/project.jsonを読み込み
    const illusionsDir = await rootHandle.getDirectoryHandle(".illusions");
    const projectFile = await illusionsDir.getFileHandle("project.json");
    const metadataText = await projectFile.read();
    const metadata: ProjectMetadata = JSON.parse(metadataText);
    
    // workspace.jsonを読み込み
    const workspaceFile = await illusionsDir.getFileHandle("workspace.json");
    const workspaceText = await workspaceFile.read();
    const workspaceState: WorkspaceState = JSON.parse(workspaceText);
    
    // main fileハンドルを取得
    const mainFileHandle = await rootHandle.getFileHandle(metadata.mainFile);
    
    // ハンドル永続化
    await this.projectManager.saveProjectHandle(metadata.projectId, rootHandle);
    
    return {
      type: "project",
      projectId: metadata.projectId,
      name: metadata.name,
      rootHandle,
      mainFileHandle,
      metadata,
      workspaceState,
    };
  }
  
  /**
   * 単一ファイルを開く（スタンドアロンモード）
   */
  async openStandaloneFile(): Promise<StandaloneMode> {
    const [fileHandle] = await window.showOpenFilePicker({
      types: [
        {
          description: "テキストファイル",
          accept: {
            "text/plain": [".txt"],
            "text/markdown": [".md"],
            "text/x-mdi": [".mdi"],
          },
        },
      ],
    });
    
    const fileExtension = this.getFileExtension(fileHandle.name);
    
    return {
      type: "standalone",
      fileHandle,
      fileName: fileHandle.name,
      fileExtension,
      editorSettings: this.getDefaultEditorSettings(fileExtension),
    };
  }
  
  private getInitialContent(fileExtension: string): string {
    switch (fileExtension) {
      case ".mdi":
        return "# 新しい物語\n\nここから書き始めてください。\n\n{漢字|かんじ}のルビや^縦中横^も使えます。\n";
      case ".md":
        return "# 新しいドキュメント\n\nMarkdown形式で書き始めてください。\n";
      case ".txt":
        return "新しいテキストファイル\n\nここから書き始めてください。\n";
    }
  }
  
  private async createGitignore(rootHandle: FileSystemDirectoryHandle): Promise<void> {
    const gitignoreContent = `# Illusions プロジェクト設定
.illusions/
*.history

# エディタバックアップ
*.bak
*.tmp
`;
    
    try {
      const gitignoreHandle = await rootHandle.getFileHandle(".gitignore", { create: true });
      await gitignoreHandle.write(gitignoreContent);
    } catch (error) {
      console.warn("Failed to create .gitignore:", error);
    }
  }
}
```

### 2.4 履歴管理サービス

```typescript
// lib/history-service.ts

export class HistoryService {
  /**
   * スナップショットを作成
   */
  async createSnapshot(
    project: ProjectMode,
    content: string,
    type: "auto" | "manual" | "milestone" = "auto",
    label?: string
  ): Promise<void> {
    const timestamp = Date.now();
    
    // ファイル名生成: "main.mdi.[202602061430].history"
    const sourceFileName = project.metadata.mainFile;
    const dateStr = format(timestamp, "yyyyMMddHHmm");
    const filename = `${sourceFileName}.[${dateStr}].history`;
    
    // スナップショットファイル作成
    const illusionsDir = await project.rootHandle.getDirectoryHandle(".illusions");
    const historyDir = await illusionsDir.getDirectoryHandle("history");
    const snapshotFile = await historyDir.getFileHandle(filename, { create: true });
    
    const writable = await snapshotFile.createWritable();
    await writable.write(content);
    await writable.close();
    
    // メタデータ計算
    const characterCount = content.length;
    const fileSize = new Blob([content]).size;
    const checksum = await this.calculateChecksum(content);
    
    // 履歴インデックス更新
    const index = await this.loadHistoryIndex(project);
    index.snapshots.push({
      id: uuidv4(),
      timestamp,
      filename,
      sourceFile: sourceFileName,
      type,
      label,
      characterCount,
      fileSize,
      checksum,
    });
    
    index.snapshots.sort((a, b) => b.timestamp - a.timestamp);
    await this.saveHistoryIndex(project, index);
    
    // 古いスナップショット削除
    await this.pruneOldSnapshots(project);
  }
  
  /**
   * スナップショットを復元
   */
  async restoreSnapshot(
    project: ProjectMode,
    snapshotId: string
  ): Promise<string> {
    const index = await this.loadHistoryIndex(project);
    const snapshot = index.snapshots.find(s => s.id === snapshotId);
    
    if (!snapshot) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }
    
    const illusionsDir = await project.rootHandle.getDirectoryHandle(".illusions");
    const historyDir = await illusionsDir.getDirectoryHandle("history");
    const snapshotFile = await historyDir.getFileHandle(snapshot.filename);
    
    const file = await snapshotFile.getFile();
    const content = await file.text();
    
    // チェックサム検証
    if (snapshot.checksum) {
      const actualChecksum = await this.calculateChecksum(content);
      if (actualChecksum !== snapshot.checksum) {
        console.warn(`Checksum mismatch for ${snapshot.filename}`);
      }
    }
    
    return content;
  }
  
  /**
   * 古いスナップショットを削除
   */
  async pruneOldSnapshots(project: ProjectMode): Promise<void> {
    const index = await this.loadHistoryIndex(project);
    const now = Date.now();
    const retentionPeriod = index.retentionDays * 24 * 60 * 60 * 1000;
    
    // 保持期間内のスナップショットをフィルタリング
    const validSnapshots = index.snapshots.filter(snapshot => {
      if (snapshot.type === "milestone") return true;
      return now - snapshot.timestamp < retentionPeriod;
    });
    
    // 最大件数を超える場合は削除
    const milestones = validSnapshots.filter(s => s.type === "milestone");
    const autoSnapshots = validSnapshots
      .filter(s => s.type !== "milestone")
      .slice(0, index.maxSnapshots);
    
    const keptSnapshots = [...milestones, ...autoSnapshots];
    const keptFilenames = new Set(keptSnapshots.map(s => s.filename));
    const deletedSnapshots = index.snapshots.filter(
      s => !keptFilenames.has(s.filename)
    );
    
    // ファイル削除
    if (deletedSnapshots.length > 0) {
      const illusionsDir = await project.rootHandle.getDirectoryHandle(".illusions");
      const historyDir = await illusionsDir.getDirectoryHandle("history");
      
      for (const snapshot of deletedSnapshots) {
        try {
          await historyDir.removeEntry(snapshot.filename);
        } catch (error) {
          console.warn(`Failed to delete ${snapshot.filename}:`, error);
        }
      }
    }
    
    index.snapshots = keptSnapshots;
    await this.saveHistoryIndex(project, index);
  }
  
  private async calculateChecksum(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  }
}
```

---

## 3. UI/UX フローの設計

### 3.1 ウェルカムスクリーン

```
┌────────────────────────────────────────────────────┐
│                  Illusions                         │
│                                                    │
│        日本語小説を書くためのエディタ               │
│                                                    │
│   ┌──────────────┐  ┌──────────────┐              │
│   │ 📁 新規プロジェクト│  │ 📂 プロジェクトを開く│              │
│   └──────────────┘  └──────────────┘              │
│                                                    │
│   ┌────────────────────────────────┐              │
│   │  📄 単一ファイルを開く          │              │
│   └────────────────────────────────┘              │
│                                                    │
│   最近のプロジェクト:                              │
│   • 📘 春の物語 (.mdi) - 2時間前                   │
│   • 📝 設定資料 (.md) - 昨日                      │
│                                                    │
└────────────────────────────────────────────────────┘
```

### 3.2 新規プロジェクト作成ウィザード

**Step 1: プロジェクト名とファイル形式の選択**

```typescript
// components/CreateProjectWizard.tsx

<div className="wizard-step">
  <label>
    プロジェクト名
    <input type="text" placeholder="例: 春の物語" />
  </label>
  
  <fieldset>
    <legend>ファイル形式を選択</legend>
    
    <label>
      <input type="radio" name="format" value=".mdi" />
      <strong>.mdi（推奨）</strong>
      <p>日本語小説向け。ルビ、縦中横、kerning調整が使えます。</p>
    </label>
    
    <label>
      <input type="radio" name="format" value=".md" />
      <strong>.md（Markdown）</strong>
      <p>標準Markdown形式。技術文書やブログ記事に最適。</p>
    </label>
    
    <label>
      <input type="radio" name="format" value=".txt" />
      <strong>.txt（プレーンテキスト）</strong>
      <p>シンプルなテキストファイル。下書きやメモに。</p>
    </label>
  </fieldset>
</div>
```

**Step 2: 保存場所選択**

ディレクトリピッカーを表示してプロジェクトフォルダを選択。

**Step 3: プロジェクト作成中**

スピナーとメッセージを表示。

### 3.3 スタンドアロンモードからのアップグレード提案

```typescript
// components/UpgradeToProjectBanner.tsx

<div className="upgrade-banner">
  <span className="icon">💡</span>
  <div>
    <h4>プロジェクトへのアップグレードをおすすめします</h4>
    <p>プロジェクト形式にすると、自動履歴管理・バージョン管理が利用できます。</p>
  </div>
  <button onClick={onUpgrade}>プロジェクトに変換</button>
  <button onClick={onDismiss}>今はしない</button>
</div>
```

**表示タイミング**:
1. 初回保存時
2. 5,000文字到達時
3. 3回目の保存時

### 3.4 履歴パネル（プロジェクトモード専用）

```typescript
// components/HistoryPanel.tsx

<div className="history-panel">
  <h3>自動保存履歴</h3>
  
  <ul className="snapshot-list">
    <li className="snapshot-item milestone">
      <div className="snapshot-header">
        <span>2026年02月06日 14:30</span>
        <span className="milestone-badge">📌 マイルストーン</span>
      </div>
      <div className="snapshot-label">第3章完成時</div>
      <div className="snapshot-meta">
        <span>12,450文字</span>
        <span>35.2 KB</span>
      </div>
      <button>復元</button>
    </li>
    
    <li className="snapshot-item auto">
      <span>2026年02月06日 14:25</span>
      <span>12,380文字</span>
      <button>復元</button>
      <button>重要にする</button>
    </li>
  </ul>
</div>
```

---

## 4. 潜在的な課題と解決策

### 4.1 ブラウザの制限

#### 課題1: 権限の永続化制限

**問題**: File System Access API の権限がブラウザ再起動後に失効する可能性。

**解決策**:
1. 権限状態の事前チェック
2. 失効時はウェルカムスクリーンへ誘導
3. Electron環境では絶対パスで直接開く

#### 課題2: Safari・Firefox の非対応

**問題**: File System Access API 未対応。

**解決策**:
1. 機能検出とフォールバック
2. UI での非対応表示
3. IndexedDB ベースの代替実装（Phase 5+）

### 4.2 ファイル変更検知

#### 課題3: 外部エディタでの同時編集

**問題**: VS Code等で同時編集した際のデータ競合。

**解決策**:

**Electron**: chokidar によるファイル監視

```typescript
// main.js
chokidar.watch(`${projectPath}/main.mdi`).on("change", (path) => {
  event.sender.send("project:file-changed", { path, content });
});
```

**Web**: 定期的なタイムスタンプチェック（5秒ごと）

```typescript
// lib/file-watcher.ts
setInterval(async () => {
  const file = await fileHandle.getFile();
  if (file.lastModified > this.lastModified) {
    this.onChanged(await file.text());
  }
}, 5000);
```

**競合UI**:

```typescript
// components/FileConflictDialog.tsx
<div>
  <h2>ファイルが外部で変更されました</h2>
  <button onClick={() => onResolve("local")}>エディタの内容を保持</button>
  <button onClick={() => onResolve("remote")}>ディスクの内容で上書き</button>
</div>
```

### 4.3 パフォーマンス

#### 課題4: 大量の履歴スナップショット

**問題**: `.illusions/history/` の肥大化。

**解決策**:
1. インテリジェントスナップショット: 5分以内の変更は統合
2. 最大100件保持（マイルストーン除く）
3. 90日以上前は自動削除

### 4.4 セキュリティ

#### 課題6: .illusions ディレクトリの漏洩

**問題**: Gitに誤ってコミットされる可能性。

**解決策**:
1. デフォルト `.gitignore` の自動生成
2. プロジェクト作成時の警告表示

---

## 5. 段階的ロードマップ

### フェーズ1: コアAPI実装（4-6週間）

**Week 1-2: VFSレイヤーの実装**
- [ ] VFS型定義 (`lib/vfs/types.ts`)
- [ ] Web VFS実装 (`lib/vfs/web-vfs.ts`)
- [ ] Electron VFS実装 (`lib/vfs/electron-vfs.ts`)
- [ ] VFS ファクトリー (`lib/vfs/index.ts`)

**Week 3-4: プロジェクトメタデータとストレージ**
- [ ] プロジェクト型定義 (`lib/project-types.ts`)
- [ ] プロジェクトマネージャー (`lib/project-manager.ts`)
- [ ] IndexedDBスキーマ拡張（Dexie v2）
- [ ] 権限マネージャー (`lib/permission-manager.ts`)

**Week 5-6: プロジェクトサービスとCRUD**
- [ ] プロジェクトサービス (`lib/project-service.ts`)
- [ ] プロジェクトディレクトリ初期化
- [ ] Electron IPC拡張
- [ ] 統合テスト

**完了基準**:
- プロジェクト作成・開く・保存が動作
- Web/Electronの両環境で動作
- 単体テストが全てパス

---

### フェーズ2: UI/UX統合（3-4週間）

**Week 7-8: ウェルカムスクリーンと起動フロー**
- [ ] WelcomeScreenコンポーネント
- [ ] CreateProjectWizardコンポーネント
- [ ] アプリ起動フロー改修
- [ ] 状態管理の拡張（`editorMode`）

**Week 9: エディタUIの拡張**
- [ ] Inspectorコンポーネント拡張
- [ ] Explorerコンポーネント拡張
- [ ] PermissionPromptコンポーネント

**Week 10: アップグレードフロー**
- [ ] UpgradeToProjectBannerコンポーネント
- [ ] ProjectUpgradeService
- [ ] アップグレード統合

**完了基準**:
- ウェルカムスクリーンから全機能にアクセス可能
- プロジェクト/スタンドアロンモードが区別できる
- アップグレードが動作

---

### フェーズ3: 履歴管理と高度な機能（4-5週間）

**Week 11-12: 履歴サービスの実装**
- [ ] HistoryServiceクラス
- [ ] `createSnapshot()` 実装
- [ ] `restoreSnapshot()` 実装
- [ ] スナップショット保持ポリシー

**Week 13: 履歴パネルUI**
- [ ] HistoryPanelコンポーネント
- [ ] スナップショット一覧表示
- [ ] 復元フロー
- [ ] 差分表示

**Week 14: ファイル変更検知**
- [ ] FileWatcherクラス（Web）
- [ ] Electron ファイル監視（chokidar）
- [ ] FileConflictDialogコンポーネント
- [ ] 競合解決フロー

**Week 15: 統合テストと最適化**
- [ ] パフォーマンス最適化
- [ ] エッジケーステスト
- [ ] ユーザードキュメント作成

**完了基準**:
- 履歴管理が完全に動作
- 外部変更が検知される
- パフォーマンスが実用レベル

---

### フェーズ4: ポリッシュと本番リリース（2-3週間）

**Week 16: バグ修正と安定化**
- [ ] バグトリアージ
- [ ] クロスブラウザテスト
- [ ] Electronビルドテスト

**Week 17: リリース準備**
- [ ] リリースノート作成
- [ ] データ移行ツール
- [ ] アナリティクス統合

**Week 18: 本番デプロイ**
- [ ] ベータ版リリース
- [ ] フィードバック収集
- [ ] 正式リリース

**完了基準**:
- 既知のクリティカルバグがゼロ
- ユーザードキュメント完成
- 本番環境で正常稼働

---

## 6. 成功指標 (KPI)

### 技術指標
- **API応答時間**: プロジェクト作成 < 3秒、ファイル保存 < 500ms
- **権限復元成功率**: 90%以上（ブラウザ再起動後）
- **エラー率**: < 1%（全ファイル操作）

### ユーザー指標
- **プロジェクトモード採用率**: 新規ユーザーの60%以上
- **既存ユーザーの移行率**: 30%以上（3ヶ月以内）
- **履歴機能利用率**: プロジェクトユーザーの40%以上

### 品質指標
- **テストカバレッジ**: 80%以上（コアAPI）
- **クリティカルバグ**: リリース前にゼロ
- **ユーザー満足度**: NPS 50以上

---

## 7. リスクと緩和策

| リスク | 影響度 | 発生確率 | 緩和策 |
|--------|--------|----------|--------|
| File System Access API のブラウザサポート不足 | 高 | 中 | Safari/Firefox向けの代替UI、Electronへの誘導 |
| 権限の永続化問題 | 中 | 高 | グレースフルデグラデーション、再選択フロー |
| 開発期間の超過 | 中 | 中 | フェーズごとの厳密な進捗管理、スコープ削減 |
| ユーザーの混乱（2モード並存） | 低 | 中 | 明確なUI表示、詳細なドキュメント |

---

## 8. 将来の拡張計画（Phase 5以降）

### マイルストーン
- **マルチファイル対応**: 章ごとに `.mdi` ファイルを分割
- **アセット管理**: 画像・参考資料のプロジェクト内管理
- **Git統合**: バージョン管理の自動化
- **コラボレーション**: 複数人での共同編集
- **クラウド同期**: Google Drive / Dropbox 統合
- **IndexedDB VFS**: Safari/Firefox向けの完全な代替実装

---

## 9. ファイル形式サポートマトリクス

| 機能 | .mdi | .md | .txt |
|------|------|-----|------|
| 基本編集 | ✅ | ✅ | ✅ |
| Markdown構文 | ✅ | ✅ | ❌ |
| MDI拡張（ルビ） | ✅ | ❌ | ❌ |
| MDI拡張（縦中横） | ✅ | ❌ | ❌ |
| 品詞ハイライト | ✅ | ❌ | ❌ |
| 履歴管理 | ✅ | ✅ | ✅ |
| プロジェクトモード | ✅ | ✅ | ✅ |

---

## 10. 参考資料

### File System Access API
- [MDN: File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)
- [Chrome Developers: File System Access](https://developer.chrome.com/articles/file-system-access/)

### IndexedDB
- [Dexie.js Documentation](https://dexie.org/)

### VS Code アーキテクチャ
- [VS Code Workspace Concept](https://code.visualstudio.com/docs/editor/workspaces)

---

## 11. 変更履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|----------|
| 1.0.0 | 2026-02-06 | 初版作成 |

---

**承認者**: _________________  
**日付**: _________________

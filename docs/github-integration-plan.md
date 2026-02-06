# GitHub統合による原稿管理機能 実装計画

## 概要

IllusionsアプリにGitHub連携機能を追加し、原稿をGitHubリポジトリに自動保存・バージョン管理できるようにします。

### 選択されたアプローチ

- **実装方法**: isomorphic-git (ElectronとWebブラウザの両方で動作)
- **リポジトリ構成**: 原稿ごとに1リポジトリ (デフォルト)
- **コミット戦略**: ハイブリッド (2秒ごとにローカルコミット、30秒後に自動プッシュ)

## アーキテクチャ設計

```
アプリケーション層 (useMdiFile, Editor)
         ↓
IGitStorageService インターフェース
         ↓
    ┌────────┴────────┐
    ↓                 ↓
ElectronGitStorage  WebGitStorage
(isomorphic-git    (isomorphic-git
+ Node.js fs)      + LightningFS)
    ↓                 ↓
GitHub OAuth        GitHub OAuth
(Custom Protocol)   (Redirect Flow)
    ↓                 ↓
Token Storage       Token Storage
(electron-store)    (IndexedDB)
```

## 実装フェーズ

### フェーズ1: 基盤インフラ構築

**依存関係のインストール**
```json
"dependencies": {
  "isomorphic-git": "^1.25.0",
  "@isomorphic-git/lightning-fs": "^4.6.0",
  "electron-store": "^8.1.0"
}
```

**新規作成ファイル**
- `lib/git/git-storage-types.ts` - 型定義とインターフェース
- `lib/git/git-storage-service.ts` - ファクトリーパターンとシングルトン
- `lib/auth/token-storage.ts` - 暗号化されたトークンストレージ
- `lib/auth/oauth-electron.ts` - Electron用OAuth (カスタムプロトコル `illusions://`)
- `lib/auth/oauth-web.ts` - Web用OAuth (リダイレクトフロー)

**修正ファイル**
- `lib/storage-types.ts` - GitSyncStateをAppStateに追加
- `package.json` - 依存関係追加

**実装内容**

1. **IGitStorageService インターフェース** (`lib/git/git-storage-types.ts`)
```typescript
export interface IGitStorageService {
  // 認証
  login(): Promise<GitAuthResult>;
  logout(): Promise<void>;
  getCurrentUser(): Promise<GitUser | null>;

  // リポジトリ操作
  listRepositories(): Promise<GitRepository[]>;
  createRepository(name: string, isPrivate: boolean): Promise<GitRepository>;
  cloneRepository(url: string, localPath: string): Promise<void>;

  // Git操作
  commitFile(filePath: string, content: string, message: string): Promise<string>;
  pushChanges(): Promise<void>;
  pullChanges(): Promise<PullResult>;
  getStatus(): Promise<GitStatus>;
  getCommitHistory(limit?: number): Promise<GitCommit[]>;
}

export interface GitSyncState {
  isAuthenticated: boolean;
  currentUser?: GitUser;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'conflict' | 'offline' | 'error';
  lastSyncTime?: number;
  currentRepository?: string;
  pendingCommits: number;
}
```

2. **トークンストレージ** (`lib/auth/token-storage.ts`)
```typescript
// Electron: electron-store with encryption
// Web: IndexedDB with Web Crypto API encryption

export class TokenStorage {
  async saveToken(token: string): Promise<void>;
  async getToken(): Promise<string | null>;
  async clearToken(): Promise<void>;
}
```

3. **OAuth実装**
   - **Electron**: カスタムプロトコルハンドラー `illusions://github-callback`
   - **Web**: 標準的なOAuthリダイレクトフロー

### フェーズ2: Git操作の実装

**新規作成ファイル**
- `lib/git/electron-git-storage.ts` - Electron用Git実装
- `lib/git/web-git-storage.ts` - Web用Git実装
- `lib/git/git-operations.ts` - 共通Git操作ヘルパー
- `lib/git/conflict-resolver.ts` - コンフリクト解決ロジック

**実装内容**

1. **ElectronGitStorage** (isomorphic-git + Node.js fs)
```typescript
export class ElectronGitStorage implements IGitStorageService {
  private gitDir: string; // ~/Library/Application Support/Illusions/git/

  async cloneRepository(url: string): Promise<void> {
    await git.clone({
      fs,
      http,
      dir: this.gitDir,
      url,
      onAuth: () => ({ username: token }),
    });
  }

  async commitFile(filePath: string, content: string, message: string): Promise<string> {
    // 1. ファイル書き込み
    // 2. git add
    // 3. git commit
    // 4. commitSHAを返す
  }

  async pushChanges(): Promise<void> {
    // git push with authentication
  }
}
```

2. **WebGitStorage** (isomorphic-git + LightningFS)
```typescript
export class WebGitStorage implements IGitStorageService {
  private fs: LightningFS;

  // ElectronGitStorageと同じインターフェース
  // LightningFSを使用してIndexedDBに保存
}
```

3. **コンフリクト検出とマージ**
```typescript
export class ConflictResolver {
  async detectConflicts(): Promise<ConflictInfo[]>;
  async resolveWithOurs(): Promise<void>;
  async resolveWithTheirs(): Promise<void>;
  async resolveManually(resolution: string): Promise<void>;
}
```

### フェーズ3: 既存ファイルシステムとの統合

**修正ファイル**
- `lib/use-mdi-file.ts` - Git統合の中核
- `lib/storage-service.ts` - Gitストレージサービスの追加

**実装内容**

1. **useMdiFileフックの拡張**
```typescript
// 既存の自動保存ロジック (2秒間隔) を維持
// Git統合を追加

useEffect(() => {
  const autoSave = async () => {
    if (isDirty && currentFile) {
      // 1. ファイル保存 (既存)
      await saveFile();

      // 2. Gitコミット (新規)
      if (gitService && isGitEnabled) {
        const commitSHA = await gitService.commitFile(
          currentFile.path,
          content,
          `Auto-save: ${new Date().toISOString()}`
        );
        setLastCommitSHA(commitSHA);
      }
    }
  };

  const timerId = setInterval(autoSave, 2000);
  return () => clearInterval(timerId);
}, [isDirty, currentFile, content]);

// デバウンスされたプッシュ (30秒後)
useEffect(() => {
  const debouncedPush = debounce(async () => {
    if (gitService && lastCommitSHA) {
      try {
        await gitService.pushChanges();
        setSyncStatus('synced');
      } catch (error) {
        if (isOffline(error)) {
          setSyncStatus('offline');
        } else if (isConflict(error)) {
          setSyncStatus('conflict');
        } else {
          setSyncStatus('error');
        }
      }
    }
  }, 30000);

  if (lastCommitSHA) {
    debouncedPush();
  }
}, [lastCommitSHA]);
```

2. **同期ステータス管理**
```typescript
const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
const [pendingCommits, setPendingCommits] = useState(0);

// オンライン/オフライン検出
useEffect(() => {
  const handleOnline = () => {
    // オフライン中のコミットを自動プッシュ
    if (pendingCommits > 0) {
      retryPush();
    }
  };

  window.addEventListener('online', handleOnline);
  return () => window.removeEventListener('online', handleOnline);
}, [pendingCommits]);
```

### フェーズ4: UIコンポーネント

**新規作成ファイル**
- `components/git/GitAuthButton.tsx` - ログイン/ログアウトボタン
- `components/git/RepositorySelector.tsx` - リポジトリ選択/作成
- `components/git/SyncStatusIndicator.tsx` - 同期ステータス表示
- `components/git/CommitHistory.tsx` - コミット履歴表示
- `components/git/ConflictResolver.tsx` - コンフリクト解決UI

**修正ファイル**
- `components/Navbar.tsx` - 同期ステータスとGitボタンを追加
- `components/Settings.tsx` - Git設定セクションを追加

**実装内容**

1. **GitAuthButton** - ナビゲーションバーに配置
```typescript
export function GitAuthButton() {
  const { isAuthenticated, user, login, logout } = useGitAuth();

  if (!isAuthenticated) {
    return <Button onClick={login}>GitHubでログイン</Button>;
  }

  return (
    <Popover>
      <PopoverTrigger>
        <Avatar src={user.avatarUrl} />
      </PopoverTrigger>
      <PopoverContent>
        <div>{user.name}</div>
        <Button onClick={logout}>ログアウト</Button>
      </PopoverContent>
    </Popover>
  );
}
```

2. **SyncStatusIndicator** - リアルタイムステータス表示
```typescript
export function SyncStatusIndicator() {
  const { syncStatus, lastSyncTime, pendingCommits } = useGitSync();

  const statusConfig = {
    idle: { icon: CloudOff, text: '未同期', color: 'gray' },
    syncing: { icon: CloudUpload, text: '同期中...', color: 'blue' },
    synced: { icon: CloudCheck, text: '同期済み', color: 'green' },
    conflict: { icon: AlertTriangle, text: '競合あり', color: 'red' },
    offline: { icon: WifiOff, text: 'オフライン', color: 'orange' },
    error: { icon: XCircle, text: 'エラー', color: 'red' },
  };

  const config = statusConfig[syncStatus];

  return (
    <div className="flex items-center gap-2">
      <config.icon className={`text-${config.color}-500`} />
      <span>{config.text}</span>
      {pendingCommits > 0 && (
        <Badge>{pendingCommits}件の未プッシュ</Badge>
      )}
    </div>
  );
}
```

3. **RepositorySelector** - 初回設定時に表示
```typescript
export function RepositorySelector() {
  const { repositories, createRepo, selectRepo } = useRepositories();

  return (
    <Dialog>
      <DialogContent>
        <DialogTitle>リポジトリを選択</DialogTitle>
        <RadioGroup>
          {repositories.map(repo => (
            <RadioItem key={repo.id} value={repo.id}>
              {repo.name}
            </RadioItem>
          ))}
        </RadioGroup>
        <Button onClick={() => createRepo('新しい原稿')}>
          新規リポジトリを作成
        </Button>
      </DialogContent>
    </Dialog>
  );
}
```

4. **CommitHistory** - サイドバーまたはモーダルで表示
```typescript
export function CommitHistory() {
  const { commits, loading } = useCommitHistory();

  return (
    <ScrollArea>
      {commits.map(commit => (
        <div key={commit.sha} className="border-b p-4">
          <div className="font-medium">{commit.message}</div>
          <div className="text-sm text-gray-500">
            {formatDate(commit.timestamp)} · {commit.author}
          </div>
        </div>
      ))}
    </ScrollArea>
  );
}
```

5. **ConflictResolver** - コンフリクト検出時に表示
```typescript
export function ConflictResolver({ conflicts }: { conflicts: ConflictInfo[] }) {
  return (
    <Dialog open>
      <DialogContent>
        <DialogTitle>変更が競合しています</DialogTitle>
        <p>リモートの変更とローカルの変更が競合しています。</p>
        <div className="flex flex-col gap-2">
          <Button onClick={resolveWithOurs}>
            自分の変更を維持
          </Button>
          <Button onClick={resolveWithTheirs}>
            リモートの変更を使用
          </Button>
          <Button onClick={showDiff}>
            差分を表示して手動で解決
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### フェーズ5: Electronメインプロセスの統合

**修正ファイル**
- `main.js` - カスタムプロトコルハンドラーとIPC追加
- `preload.js` - Git API公開
- `types/electron.d.ts` - 型定義追加

**実装内容**

1. **カスタムプロトコル登録** (`main.js`)
```javascript
// アプリ起動時
app.setAsDefaultProtocolClient('illusions');

// OAuth コールバック処理
app.on('open-url', (event, url) => {
  event.preventDefault();

  // illusions://github-callback?code=xxx&state=yyy
  const parsedUrl = new URL(url);
  const code = parsedUrl.searchParams.get('code');
  const state = parsedUrl.searchParams.get('state');

  // レンダラープロセスに通知
  mainWindow.webContents.send('oauth-callback', { code, state });
});
```

2. **Git IPC ハンドラー** (`main.js`)
```javascript
// セキュリティ上の理由で、git操作はメインプロセスで実行しない
// isomorphic-gitはレンダラープロセスで直接実行可能
// ただし、トークンストレージはメインプロセスで管理

ipcMain.handle('git:save-token', async (_event, token) => {
  const store = new Store({ encryptionKey: 'illusions-secret' });
  store.set('github.token', token);
});

ipcMain.handle('git:get-token', async () => {
  const store = new Store({ encryptionKey: 'illusions-secret' });
  return store.get('github.token');
});

ipcMain.handle('git:clear-token', async () => {
  const store = new Store({ encryptionKey: 'illusions-secret' });
  store.delete('github.token');
});
```

3. **Preloadブリッジ** (`preload.js`)
```javascript
contextBridge.exposeInMainWorld('electronAPI', {
  // 既存のAPI
  isElectron: true,
  openFile: () => ipcRenderer.invoke('open-file'),
  // ...

  // 新しいGit API
  git: {
    saveToken: (token) => ipcRenderer.invoke('git:save-token', token),
    getToken: () => ipcRenderer.invoke('git:get-token'),
    clearToken: () => ipcRenderer.invoke('git:clear-token'),
    onOAuthCallback: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('oauth-callback', handler);
      return () => ipcRenderer.removeListener('oauth-callback', handler);
    },
  },
});
```

4. **型定義** (`types/electron.d.ts`)
```typescript
interface GitAPI {
  saveToken(token: string): Promise<void>;
  getToken(): Promise<string | null>;
  clearToken(): Promise<void>;
  onOAuthCallback(callback: (data: { code: string; state: string }) => void): () => void;
}

interface ElectronAPI {
  // 既存
  isElectron: boolean;
  openFile: () => Promise<{ path: string; content: string }>;
  // ...

  // 新規
  git: GitAPI;
}
```

## セキュリティ考慮事項

### トークンストレージ

**Electron**
- `electron-store`を暗号化キー付きで使用
- トークンはメインプロセスでのみアクセス可能
- レンダラープロセスはIPC経由でのみトークンを要求

**Web**
- IndexedDBに暗号化して保存
- Web Crypto APIで暗号化
- ログアウト時にトークンをクリア

### OAuth セキュリティ

**Electron**
- カスタムプロトコル `illusions://github-callback`
- stateパラメーターでCSRF対策
- コード交換はメインプロセスで実行

**Web**
- 標準的なOAuthリダイレクトフロー
- stateパラメーターでCSRF対策
- PKCEを実装して追加のセキュリティ

### IPC セキュリティ

- すべてのIPCハンドラーで入力検証
- GitHub URLのバリデーション (github.comのみ許可)
- リポジトリ名とパスのサニタイズ
- レート制限を実装して悪用を防止

## エラーハンドリング

### ネットワーク障害
```typescript
// オフライン検出
window.addEventListener('offline', () => {
  setSyncStatus('offline');
  queuePendingCommits();
});

window.addEventListener('online', () => {
  setSyncStatus('syncing');
  retryPendingPushes();
});

// APIレート制限
if (error.status === 403 && error.headers['x-ratelimit-remaining'] === '0') {
  const resetTime = new Date(error.headers['x-ratelimit-reset'] * 1000);
  showNotification(`GitHub APIレート制限に達しました。${formatTime(resetTime)}に再試行されます。`);
  scheduleRetry(resetTime);
}

// プッシュ失敗
async function pushWithRetry(maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await gitService.pushChanges();
      return;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(2 ** i * 1000); // 指数バックオフ
    }
  }
}
```

### コンフリクト処理
```typescript
async function handlePushConflict() {
  // 1. リモート変更をフェッチ
  await gitService.fetch();

  // 2. マージを試行
  const mergeResult = await gitService.merge();

  if (mergeResult.conflicts.length > 0) {
    // 3. コンフリクトあり - UIを表示
    showConflictResolver(mergeResult.conflicts);
  } else {
    // 4. クリーンマージ - プッシュ
    await gitService.pushChanges();
  }
}
```

### 認証エラー
```typescript
// トークン期限切れ検出
if (error.status === 401) {
  // 再認証を促す
  showNotification('GitHubセッションが期限切れです。再ログインしてください。');
  setSyncStatus('error');

  // 未保存の変更は保持
  preserveUncommittedChanges();

  // 再認証後に再開
  await reAuthenticate();
  await resumeSync();
}
```

## ユーザーエクスペリエンスフロー

### 初回セットアップ
```
1. アプリを開く
2. 「GitHubでログイン」ボタンをクリック
3. ブラウザが開く → GitHub認証
4. Electron: illusions:// にリダイレクト
   Web: コールバックページにリダイレクト
5. トークンを安全に保存
6. 「リポジトリを選択」ダイアログ表示
7. 既存リポジトリを選択 or 新規作成
8. リポジトリをローカルにクローン
   - Electron: ~/Library/Application Support/Illusions/git/
   - Web: IndexedDB (LightningFS)
9. 編集可能状態
```

### 通常の編集フロー
```
1. ファイルを開く (または新規作成)
2. コンテンツを編集
3. 2秒後に自動保存
   → ローカルファイルに保存
   → Gitローカルコミット作成
4. 30秒間変更がない場合
   → 自動的にGitHubへプッシュ
   → 同期インジケーターが「同期中...」
5. プッシュ完了
   → 同期インジケーターが「同期済み ✓」
6. プッシュ失敗 (オフライン/コンフリクト)
   → 同期インジケーターが「オフライン」または「競合あり」
   → 変更はローカルgitに保持
   → オンライン復帰時に自動リトライ
```

### コンフリクト解決フロー
```
1. プッシュ時にコンフリクト検出
2. コンフリクトダイアログ表示
   「リモートの変更とローカルの変更が競合しています」
   オプション:
   a. 「自分の変更を維持」(force push)
   b. 「リモートの変更を使用」(ローカル破棄)
   c. 「差分を表示」(手動マージ)
3. ユーザーがオプションを選択
4. コンフリクトを解決
5. 必要に応じてマージコミットを作成
6. 自動同期を再開
```

## テスト戦略

### 単体テスト
```typescript
// lib/git/__tests__/
git-operations.test.ts           // Git操作のテスト
github-oauth.test.ts             // OAuthフローのテスト
conflict-resolver.test.ts        // コンフリクト解決のテスト
token-storage.test.ts            // トークンストレージのテスト

// isomorphic-gitをモック化して予測可能なテスト
```

### 統合テスト
```typescript
// 完全なフローをテスト
describe('Git Integration Flow', () => {
  test('clone → create file → commit → push', async () => {
    await gitService.cloneRepository('https://github.com/user/repo');
    await gitService.commitFile('test.mdi', 'content', 'Initial commit');
    await gitService.pushChanges();

    const status = await gitService.getStatus();
    expect(status.clean).toBe(true);
  });
});
```

### E2Eテスト (Electron)
```typescript
// Playwright使用
test('GitHub login flow', async ({ electronApp }) => {
  const window = await electronApp.firstWindow();

  // ログインボタンをクリック
  await window.click('text=GitHubでログイン');

  // OAuth完了を待つ
  await window.waitForSelector('text=ログアウト');

  // リポジトリ作成
  await window.click('text=新規リポジトリを作成');
  await window.fill('input[name="repoName"]', 'test-manuscript');
  await window.click('text=作成');

  // 編集してコミット
  await window.fill('.editor', 'テストコンテンツ');
  await window.waitForSelector('text=同期済み');
});
```

### 手動テストチェックリスト
```
□ GitHubログイン (Electron)
□ GitHubログイン (Web)
□ 新規リポジトリ作成
□ 既存リポジトリをクローン
□ ファイル作成と自動コミット
□ GitHubへプッシュ
□ 2つのデバイスで編集 → コンフリクト
□ コンフリクト解決
□ オフライン作業 → オンライン復帰時に自動同期
□ トークン期限切れ → 再認証
□ ネットワーク障害ハンドリング
□ 大きなファイル (>1MB) のハンドリング
□ コミット履歴表示
□ ログアウト → トークンクリア
```

## 検証方法

### エンドツーエンドテスト手順

1. **Electronアプリで検証**
```bash
# 依存関係インストール
npm install

# 開発モードで起動
npm run electron:dev

# 手順:
# 1. GitHubでログイン
# 2. 新規リポジトリ「test-manuscript」を作成
# 3. 新規ファイル作成
# 4. テキストを入力
# 5. 2秒待つ → コミット確認
# 6. 30秒待つ → GitHub上でコミット確認
# 7. ブラウザでGitHub.comを開いてコミット履歴を確認
```

2. **Webブラウザで検証**
```bash
# ビルドして起動
npm run build
npm start

# 手順: 上記と同じ
```

3. **コンフリクトテスト**
```bash
# 2つのブラウザウィンドウで同じリポジトリを開く
# ウィンドウ1: 「バージョン1」を入力 → 保存
# ウィンドウ2 (オフライン): 「バージョン2」を入力 → 保存
# ウィンドウ2をオンラインに戻す
# コンフリクトダイアログが表示されることを確認
```

## 重要なファイル一覧

### 新規作成 (コア)
- `lib/git/git-storage-types.ts` - 型定義
- `lib/git/git-storage-service.ts` - サービスファクトリー
- `lib/git/electron-git-storage.ts` - Electron実装
- `lib/git/web-git-storage.ts` - Web実装
- `lib/auth/token-storage.ts` - トークン管理
- `lib/auth/oauth-electron.ts` - Electron OAuth
- `lib/auth/oauth-web.ts` - Web OAuth

### 新規作成 (UI)
- `components/git/GitAuthButton.tsx`
- `components/git/RepositorySelector.tsx`
- `components/git/SyncStatusIndicator.tsx`
- `components/git/CommitHistory.tsx`
- `components/git/ConflictResolver.tsx`

### 新規作成 (フック)
- `hooks/use-git-auth.ts`
- `hooks/use-git-sync.ts`
- `hooks/use-commit-history.ts`

### 修正必須
- `lib/storage-types.ts` - GitSyncState追加
- `lib/use-mdi-file.ts` - Git統合 (最重要)
- `main.js` - カスタムプロトコル + IPC
- `preload.js` - Git API公開
- `types/electron.d.ts` - 型定義
- `components/Navbar.tsx` - UI追加
- `package.json` - 依存関係

## 実装優先順位

### P0 (必須 - 基本機能)
1. OAuth認証 (Electron + Web)
2. トークンストレージ
3. isomorphic-git基本操作 (commit, push, pull)
4. useMdiFileへの統合 (auto-commit)
5. GitAuthButton UI
6. SyncStatusIndicator UI

### P1 (重要 - UX向上)
1. リポジトリ選択UI
2. コンフリクト検出
3. オフライン/オンライン検出
4. エラーハンドリング
5. デバウンスされたプッシュ

### P2 (推奨 - 高度な機能)
1. コミット履歴表示
2. コンフリクト解決UI
3. 手動コミットオプション
4. ブランチサポート
5. 設定パネル

## まとめ

この計画により、Illusionsアプリに以下の機能が追加されます:

✅ **クロスプラットフォーム**: ElectronとWebブラウザの両方で動作
✅ **オフライン対応**: ローカルでコミット、オンライン時に自動同期
✅ **自動バックアップ**: 2秒ごとにローカルコミット、30秒後にGitHubへ
✅ **バージョン管理**: 完全なGit履歴とコミット履歴
✅ **コンフリクト解決**: 複数デバイス間の編集競合を検出・解決
✅ **セキュア**: 暗号化されたトークンストレージと安全なIPC

既存のコードベースパターン(ストレージ抽象化、IPC設計、デュアルモードサポート)を活用することで、保守性の高い実装が可能です。

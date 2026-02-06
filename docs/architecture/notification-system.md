# 通知ポップアップシステム使用ガイド

VS Code 風の通知ポップアップシステム。info（情報）、warning（警告）、error（エラー）の3種類と、進捗バー付き通知をサポートしています。

## 機能

- ✅ 3種類の通知タイプ：`info`（情報）、`warning`（警告）、`error`（エラー）
- ✅ 通常の通知：デフォルトで10秒後に自動的に閉じます
- ✅ 進捗バー付き通知：進捗が100%に達してから3秒後に自動的に閉じます
- ✅ 手動で閉じる：閉じるボタンをクリックして閉じることができます
- ✅ スムーズなアニメーション：フェードイン・フェードアウト効果
- ✅ レスポンシブデザイン：ライト・ダークテーマ対応

## インストールと使用方法

### 1. レイアウトにコンテナコンポーネントを追加

ルートレイアウトファイル（例：`app/layout.tsx`）に `NotificationContainer` コンポーネントを追加します：

```tsx
import { NotificationContainer } from '@/components/NotificationContainer';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        {children}
        {/* 通知コンテナを追加 */}
        <NotificationContainer />
      </body>
    </html>
  );
}
```

### 2. 通知マネージャーを使用

任意のコンポーネントまたは関数で `notificationManager` をインポートして使用します：

```tsx
import { notificationManager } from '@/lib/notification-manager';
```

## API ドキュメント

### 基本メソッド

#### `showMessage(message: string, options?: NotificationOptions): string`

通常の通知を表示します。

**パラメータ：**
- `message` - 通知内容
- `options` - オプション設定
  - `type` - 通知タイプ：`'info'` | `'warning'` | `'error'`、デフォルトは `'info'`
  - `duration` - 表示時間（ミリ秒）、デフォルトは `10000`（10秒）

**戻り値：** 通知ID（後続の操作に使用可能）

**使用例：**
```tsx
// 情報通知を表示（10秒後に自動的に閉じる）
const id = notificationManager.showMessage('操作が成功しました！');

// 警告通知を表示（5秒後に自動的に閉じる）
notificationManager.showMessage('データを確認してください', {
  type: 'warning',
  duration: 5000
});

// エラー通知を表示（自動的に閉じない）
notificationManager.showMessage('エラーが発生しました。再試行してください', {
  type: 'error',
  duration: 0
});
```

---

#### `showProgress(message: string, options?: ProgressNotificationOptions): string`

進捗バー付きの通知を表示します。

**パラメータ：**
- `message` - 通知内容
- `options` - オプション設定
  - `type` - 通知タイプ：`'info'` | `'warning'` | `'error'`、デフォルトは `'info'`
  - `progress` - 初期進捗（0-100）、デフォルトは `0`

**戻り値：** 通知ID（進捗更新に使用）

**使用例：**
```tsx
// 進捗バー付き通知を表示
const id = notificationManager.showProgress('ファイルをアップロード中...', {
  progress: 0
});

// 進捗を更新
notificationManager.updateProgress(id, 50);
notificationManager.updateProgress(id, 100); // 100%に達すると3秒後に自動的に閉じる
```

---

#### `updateProgress(id: string, progress: number, message?: string): void`

進捗バーの進捗と通知内容を更新します。

**パラメータ：**
- `id` - 通知ID
- `progress` - 新しい進捗値（0-100）
- `message` - オプションの新しい通知内容

**使用例：**
```tsx
const id = notificationManager.showProgress('処理を開始...');

// 進捗と通知内容を更新
notificationManager.updateProgress(id, 25, 'ファイルを読み込み中...');
notificationManager.updateProgress(id, 50, 'データを処理中...');
notificationManager.updateProgress(id, 75, '結果を保存中...');
notificationManager.updateProgress(id, 100, '処理が完了しました！');
```

---

#### `dismiss(id: string): void`

指定した通知を手動で閉じます。

**使用例：**
```tsx
const id = notificationManager.showMessage('この通知は手動で閉じられます', {
  duration: 0 // 自動的に閉じない
});

// 3秒後に手動で閉じる
setTimeout(() => {
  notificationManager.dismiss(id);
}, 3000);
```

---

#### `dismissAll(): void`

すべての通知を閉じます。

**使用例：**
```tsx
notificationManager.dismissAll();
```

---

### 便利なメソッド

#### `info(message: string, duration?: number): string`

情報通知を表示します（青色）。

```tsx
notificationManager.info('ファイルを保存しました');
notificationManager.info('ようこそ', 5000);
```

---

#### `warning(message: string, duration?: number): string`

警告通知を表示します（黄色）。

```tsx
notificationManager.warning('ディスク容量が不足しています');
notificationManager.warning('まもなくタイムアウトします', 3000);
```

---

#### `error(message: string, duration?: number): string`

エラー通知を表示します（赤色）。

```tsx
notificationManager.error('ネットワーク接続に失敗しました');
notificationManager.error('保存に失敗しました。再試行してください', 15000);
```

---

## 完全な使用例

### 例1：通常の通知

```tsx
'use client';

import { notificationManager } from '@/lib/notification-manager';

export function MyComponent() {
  const handleSave = async () => {
    try {
      // ローディング通知を表示
      const id = notificationManager.info('保存中...', 0);

      // 保存処理を実行
      await saveData();

      // ローディング通知を閉じる
      notificationManager.dismiss(id);

      // 成功通知を表示
      notificationManager.info('保存に成功しました！');
    } catch (error) {
      // エラー通知を表示
      notificationManager.error('保存に失敗しました：' + error.message);
    }
  };

  return (
    <button onClick={handleSave}>
      保存
    </button>
  );
}
```

### 例2：進捗バー付き通知

```tsx
'use client';

import { notificationManager } from '@/lib/notification-manager';

export function FileUploader() {
  const handleUpload = async (file: File) => {
    // 進捗バー付き通知を作成
    const id = notificationManager.showProgress('ファイルのアップロードを開始...', {
      progress: 0
    });

    try {
      // ファイルアップロードの進捗をシミュレート
      for (let i = 0; i <= 100; i += 10) {
        await new Promise(resolve => setTimeout(resolve, 200));
        notificationManager.updateProgress(
          id,
          i,
          i < 100 ? `アップロード中... ${i}%` : 'アップロード完了！'
        );
      }
      // 進捗が100%に達すると3秒後に自動的に閉じる
    } catch (error) {
      // 進捗バーを閉じる
      notificationManager.dismiss(id);
      // エラーを表示
      notificationManager.error('アップロードに失敗しました：' + error.message);
    }
  };

  return (
    <input
      type="file"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) handleUpload(file);
      }}
    />
  );
}
```

### 例3：複数の通知タイプ

```tsx
'use client';

import { notificationManager } from '@/lib/notification-manager';

export function NotificationDemo() {
  return (
    <div className="space-y-2">
      <button
        onClick={() => notificationManager.info('これは情報通知です')}
        className="px-4 py-2 bg-blue-500 text-white rounded"
      >
        情報を表示
      </button>

      <button
        onClick={() => notificationManager.warning('これは警告通知です')}
        className="px-4 py-2 bg-yellow-500 text-white rounded"
      >
        警告を表示
      </button>

      <button
        onClick={() => notificationManager.error('これはエラー通知です')}
        className="px-4 py-2 bg-red-500 text-white rounded"
      >
        エラーを表示
      </button>

      <button
        onClick={() => {
          const id = notificationManager.showProgress('処理中...', { progress: 0 });
          let progress = 0;
          const timer = setInterval(() => {
            progress += 10;
            notificationManager.updateProgress(id, progress);
            if (progress >= 100) clearInterval(timer);
          }, 500);
        }}
        className="px-4 py-2 bg-green-500 text-white rounded"
      >
        進捗バーを表示
      </button>

      <button
        onClick={() => notificationManager.dismissAll()}
        className="px-4 py-2 bg-gray-500 text-white rounded"
      >
        すべて閉じる
      </button>
    </div>
  );
}
```

## カスタムスタイル

通知コンポーネントは Tailwind CSS で書かれており、ライト・ダークテーマに対応しています。`components/Notification.tsx` を修正することでスタイルをカスタマイズできます：

```tsx
// 通知タイプの色設定を変更
const config = {
  info: {
    icon: Info,
    bgColor: 'bg-blue-500',      // 進捗バーの色
    borderColor: 'border-blue-500', // 左側のボーダー色
    textColor: 'text-blue-500',    // アイコンの色
  },
  // ... その他の設定
};
```

## 注意事項

1. **自動的に閉じる時間**：
   - 通常の通知はデフォルトで10秒後に自動的に閉じます
   - 進捗バー付き通知は進捗が100%に達してから3秒後に自動的に閉じます
   - `duration: 0` を設定すると自動的に閉じる機能を無効化できます

2. **進捗の更新**：
   - 進捗値は自動的に0-100の範囲に制限されます
   - 進捗バー付き通知のみ進捗を更新できます

3. **通知の位置**：
   - 通知はデフォルトで画面の右上に表示されます
   - 複数の通知は縦に並んで表示されます

4. **パフォーマンスの最適化**：
   - 通知マネージャーはシングルトンパターンを使用し、グローバルに1つのインスタンスを共有します
   - サブスクリプションパターンを使用してUIを更新し、不要な再レンダリングを回避します

## 型定義

すべての型定義は `types/notification.ts` にあります：

```typescript
export type NotificationType = 'info' | 'warning' | 'error';

export interface NotificationMessage {
  id: string;
  type: NotificationType;
  message: string;
  duration?: number;
}

export interface NotificationProgress extends NotificationMessage {
  progress?: number; // 0-100
}

export type NotificationItem = NotificationMessage | NotificationProgress;
```

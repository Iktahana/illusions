# UI Overlay Components Reference

illusions で使用されている全てのオーバーレイ UI コンポーネント（モーダル、トースト、ドロップダウン等）の一覧。

## Summary

| Category | Count | Components |
|----------|-------|------------|
| Modal / Dialog | 8 | GlassDialog, ConfirmDialog, FileConflictDialog, RubyDialog, SearchDialog, UnsavedWarningDialog, SettingsModal, CreateProjectWizard, PermissionPrompt |
| Toast / Notification | 2 | Notification, NotificationContainer |
| Dropdown / Popover | 4 | ColorPicker, FontSelector, MenuDropdown, NewTabMenu |
| Context Menu | 2 | ContextMenu, EditorContextMenu |
| Floating Toolbar | 1 | BubbleMenu |
| Banner | 1 | UpgradeToProjectBanner |
| Tooltip | 2 | InfoTooltip (Inspector), Timestamp Tooltip (HistoryPanel) |

---

## 1. Modal / Dialog

All modal dialogs share a common base: `GlassDialog` — frosted-glass overlay with `backdrop-blur-sm bg-black/30`.

### GlassDialog

- **File**: `components/GlassDialog.tsx`
- **Purpose**: Reusable base component for all dialogs
- **Trigger**: Controlled via `isOpen` prop
- **Characteristics**:
  - `fixed inset-0 z-50` overlay
  - Frosted glass panel: `rounded-xl bg-background-elevated backdrop-blur-xl shadow-2xl ring-1 ring-white/10`
  - Customizable via `panelClassName` prop
  - Optional backdrop click handler

### ConfirmDialog

- **File**: `components/ConfirmDialog.tsx`
- **Purpose**: Generic confirmation with title, message, two buttons
- **Trigger**: Controlled via `isOpen` prop
- **Characteristics**:
  - Built on GlassDialog
  - Buttons: キャンセル / 確認 (configurable labels)
  - `dangerous` prop styles confirm button red
  - Backdrop click dismisses

### FileConflictDialog

- **File**: `components/FileConflictDialog.tsx`
- **Purpose**: Shown when external file changes detected on disk
- **Trigger**: File watcher detects modification
- **Characteristics**:
  - Blocking — cannot dismiss via backdrop
  - Shows diff stats: `+X 文字追加` / `−X 文字削除`
  - Buttons: エディタの内容を保持 / ディスクの内容を読み込む

### RubyDialog

- **File**: `components/RubyDialog.tsx`
- **Purpose**: Ruby (ふりがな) annotation editor
- **Trigger**: Text selection → context menu "ルビ" or `Shift+Cmd+R`
- **Characteristics**:
  - NLP tokenization via kuromoji
  - Editable reading inputs per token
  - Live preview of ruby markup: `{表|おもて}`
  - Buttons: キャンセル / 適用

### SearchDialog

- **File**: `components/SearchDialog.tsx`
- **Purpose**: Floating find dialog
- **Trigger**: `Cmd+F`
- **Characteristics**:
  - **Draggable** — repositionable by header
  - Default position: top-right (`top: 64, right: 16`)
  - Match counter: `{current}/{total}`
  - Case-sensitive toggle
  - `Enter` / `Shift+Enter` to navigate matches

### UnsavedWarningDialog

- **File**: `components/UnsavedWarningDialog.tsx`
- **Purpose**: Warns of unsaved changes before close
- **Trigger**: Closing tab/app with unsaved changes
- **Characteristics**:
  - Blocking — no backdrop dismiss
  - Three buttons: キャンセル / 保存しない / 保存

### SettingsModal

- **File**: `components/SettingsModal.tsx`
- **Purpose**: Application settings with tabbed interface
- **Trigger**: Settings button or menu item
- **Characteristics**:
  - Large: `max-w-4xl`, `h-[80vh]`
  - Two-column: sidebar tabs + content area
  - Tabs: エディタ, 縦書き, 品詞ハイライト, 校正, AI校正, illusionsについて
  - Escape or backdrop click to close

### CreateProjectWizard

- **File**: `components/CreateProjectWizard.tsx`
- **Purpose**: Multi-step new project creation
- **Trigger**: "New Project" action
- **Characteristics**:
  - Step 1: Name input + format selection (MDI, Markdown, Plain text)
  - Step 2: Progress → Success / Error
  - Success auto-closes after 800ms

### PermissionPrompt

- **File**: `components/PermissionPrompt.tsx`
- **Purpose**: File System Access API permission request (web only)
- **Trigger**: Opening/creating project without permission
- **Characteristics**:
  - Blocking during request
  - Buttons: キャンセル / 許可する

---

## 2. Toast / Notification

### Notification

- **File**: `components/Notification.tsx`
- **Purpose**: Individual toast notification
- **Trigger**: `notificationManager.info()` / `.warning()` / `.error()` / `.success()` / `.showMessage()`
- **Characteristics**:
  - Fixed width: 340px
  - Types: info (blue), warning (yellow), error (red), success (green)
  - Optional action buttons (max 3)
  - Optional progress bar (0–100%)
  - Auto-dismiss by duration (default 10s, `0` = persistent)
  - Animation: `animate-notification-in` / `animate-notification-out`

### NotificationContainer

- **File**: `components/NotificationContainer.tsx`
- **Purpose**: Container managing toast stack
- **Mount**: `app/layout.tsx`
- **Characteristics**:
  - Position: `fixed bottom-4 right-4 z-50`
  - Max 5 visible (latest wins)
  - Stack: `flex-col gap-2`

### API

```typescript
import { notificationManager } from '@/lib/notification-manager';

// Simple messages
notificationManager.info('処理が完了しました');
notificationManager.warning('注意が必要です');
notificationManager.error('保存に失敗しました');
notificationManager.success('ファイルを保存しました');

// With action buttons
notificationManager.showMessage('保存に失敗しました', {
  type: 'error',
  duration: 0, // persistent
  actions: [
    { label: '再試行', onClick: () => saveFile() },
    { label: '設定を開く', onClick: () => openSettings() },
  ],
});

// Progress
const id = notificationManager.showProgress('アップロード中...', { progress: 0 });
notificationManager.updateProgress(id, 50, 'アップロード中... 50%');
notificationManager.updateProgress(id, 100); // auto-closes after 3s
```

---

## 3. Dropdown / Popover

### ColorPicker

- **File**: `components/ColorPicker.tsx`
- **Purpose**: Color selection for POS highlight settings
- **Trigger**: Click on color swatch
- **Characteristics**:
  - 24-color preset grid (8 columns)
  - Custom hex input with color picker
  - Closes on selection or outside click

### FontSelector

- **File**: `components/explorer/FontSelector.tsx`
- **Purpose**: Font family selection
- **Trigger**: Click on font selector in settings
- **Characteristics**:
  - Search filter
  - Sections: ローカル (Electron only), おすすめ, すべてのフォント
  - Preloads Google Fonts on mount

### MenuDropdown

- **File**: `components/WebMenuBar/MenuDropdown.tsx`
- **Purpose**: macOS-style menu bar dropdowns
- **Trigger**: Click on menu title (ファイル, 編集, 表示, etc.)
- **Characteristics**:
  - Min width 220px
  - Fade-in animation (100ms)
  - Closes on outside click or Escape

### NewTabMenu

- **File**: `components/NewTabMenu.tsx`
- **Purpose**: File type selector for new tabs
- **Trigger**: Click "+" button on tab bar
- **Characteristics**:
  - Three options: .mdi, .md, .txt
  - Closes on selection, outside click, or Escape

---

## 4. Context Menu

### ContextMenu

- **File**: `components/ContextMenu.tsx`
- **Purpose**: Generic right-click menu
- **Trigger**: Right-click event via `use-context-menu` hook
- **Characteristics**:
  - Portal-rendered to `document.body`
  - Fixed width 180px
  - Position: `left: x, top: y` from mouse event

### EditorContextMenu

- **File**: `components/EditorContextMenu.tsx`
- **Purpose**: Rich editor right-click menu
- **Trigger**: Right-click in editor area
- **Characteristics**:
  - Built on Radix UI `@radix-ui/react-context-menu`
  - Actions: cut, copy, paste, ruby, tcy, find, dictionary, select-all, lint hint
  - Context-aware (disables items based on selection state)
  - Animated: slide/fade per Radix placement

---

## 5. Floating Toolbar

### BubbleMenu

- **File**: `components/BubbleMenu.tsx`
- **Purpose**: Text formatting toolbar on selection
- **Trigger**: Text selection in editor
- **Characteristics**:
  - Position: above selection (horizontal) / left (vertical writing mode)
  - Buttons: Bold, Italic, Strikethrough, Quote, Lists, Code, Link
  - Heading submenu (H1/H2/H3)
  - Tooltips with keyboard shortcuts

---

## 6. Banner

### UpgradeToProjectBanner

- **File**: `components/UpgradeToProjectBanner.tsx`
- **Purpose**: Suggests upgrading standalone mode to project mode
- **Trigger**: Automatic when in standalone mode
- **Characteristics**:
  - Slide-down animation (`max-h` + opacity transition, 300ms)
  - Left accent border: `border-l-4 border-accent`
  - Buttons: プロジェクトに変換 / 今はしない
  - Dismissible via X button

---

## 7. Tooltip

### InfoTooltip (Inspector)

- **File**: `components/Inspector.tsx` (nested component)
- **Purpose**: Help text for stat labels
- **Trigger**: Hover over info icon
- **Characteristics**:
  - Fixed position, viewport-aware
  - Fade-in animation
  - Placement: top (default) or bottom

### Timestamp Tooltip (HistoryPanel)

- **File**: `components/HistoryPanel.tsx`
- **Purpose**: Full timestamp on hover over snapshot date
- **Trigger**: Hover over date/time text
- **Characteristics**:
  - Portal-rendered to `document.body`
  - Auto-hides after 100ms delay

---

## Common Patterns

- **z-index**: All overlays use `z-50`
- **Theme**: All components use CSS variable tokens (`--foreground`, `--background-elevated`, `--accent`, etc.)
- **Dismiss**: Dropdowns/menus close on outside click + Escape; dialogs vary (some blocking)
- **Animations**: CSS keyframes in `app/globals.css`; Radix UI animations for context menus

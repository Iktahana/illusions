# Illusions 架構文檔

## 系統架構概覽

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Client Side)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Next.js App Router                      │  │
│  │                     (app/layout.tsx)                       │  │
│  └────────────────────┬───────────────────────────────────────┘  │
│                       │                                           │
│                       ▼                                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                StorageProvider Context                     │  │
│  │           (lib/storage-context.tsx)                        │  │
│  │                                                            │  │
│  │  • currentDocument: NovelDocument | null                  │  │
│  │  • saveDocument(doc): Promise<void>                       │  │
│  │  • loadDocument(id): Promise<void>                        │  │
│  └────────────────────┬───────────────────────────────────────┘  │
│                       │                                           │
│                       ▼                                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Main Page (app/page.tsx)                │  │
│  │                                                            │  │
│  │  ┌─────────────────────────────────────────────────┐     │  │
│  │  │            Navbar Component                      │     │  │
│  │  │  [Logo] [Document Title] [Save Status] [Avatar] │     │  │
│  │  └─────────────────────────────────────────────────┘     │  │
│  │                                                            │  │
│  │  ┌───────┬─────────────────────────┬─────────────────┐  │  │
│  │  │       │                         │                 │  │  │
│  │  │ Expl  │       Editor            │    Inspector    │  │  │
│  │  │ orer  │   (Milkdown + Tools)    │                 │  │  │
│  │  │       │                         │                 │  │  │
│  │  │ 256px │       flex-1            │      320px      │  │  │
│  │  │       │                         │                 │  │  │
│  │  └───────┴─────────────────────────┴─────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## 組件層級結構

```
app/page.tsx (Root)
│
├─ StorageProvider
│  └─ EditorPage
│     │
│     ├─ Navbar
│     │  ├─ Logo (FileText + Text)
│     │  ├─ Document Title
│     │  ├─ Save Status Indicator
│     │  └─ User Avatar
│     │
│     ├─ Explorer (Left Sidebar)
│     │  ├─ Tab Navigation
│     │  │  ├─ Chapters Tab
│     │  │  ├─ Settings Tab
│     │  │  └─ Style Tab
│     │  │
│     │  └─ Content Panel
│     │     ├─ ChaptersPanel
│     │     │  └─ ChapterItem[]
│     │     ├─ SettingsPanel
│     │     │  ├─ Title Input
│     │     │  ├─ Author Input
│     │     │  └─ Description Textarea
│     │     └─ StylePanel
│     │        ├─ Font Select
│     │        ├─ Font Size Slider
│     │        └─ Line Height Slider
│     │
│     ├─ NovelEditor (Center)
│     │  ├─ EditorToolbar
│     │  │  ├─ Vertical Toggle Button
│     │  │  ├─ Font Size Slider
│     │  │  └─ Markdown Badge
│     │  │
│     │  └─ MilkdownProvider
│     │     └─ ProsemirrorAdapterProvider
│     │        └─ MilkdownEditor
│     │           └─ Milkdown (Editor Instance)
│     │
│     └─ Inspector (Right Sidebar)
│        ├─ Tab Navigation
│        │  ├─ AI Tab
│        │  ├─ Corrections Tab
│        │  └─ Stats Tab
│        │
│        └─ Content Panel
│           ├─ AIPanel
│           │  ├─ AI Info Card
│           │  ├─ Suggestions[]
│           │  └─ Input Area
│           ├─ CorrectionsPanel
│           │  └─ CorrectionItem[]
│           └─ StatsPanel
│              ├─ StatCard[] (Grid)
│              ├─ Manuscript Info
│              └─ Writing Pace
```

## 資料流架構

### 1. 編輯流程

```
User types in Editor
       ↓
Milkdown listenerCtx.markdownUpdated
       ↓
handleContentChange(content)
       ↓
Calculate statistics (charCount, wordCount)
       ↓
saveDocument({ ...doc, content, metadata })
       ↓
StorageAdapter.save()
       ↓
Update UI (lastSaved, isSaving)
```

### 2. 狀態管理

```
StorageContext (Global State)
├─ adapter: StorageAdapter
├─ currentDocument: NovelDocument | null
├─ isLoading: boolean
└─ methods:
   ├─ saveDocument()
   ├─ loadDocument()
   └─ listDocuments()

EditorPage (Local State)
├─ isSaving: boolean
├─ lastSaved: Date
├─ wordCount: number
└─ charCount: number

NovelEditor (Local State)
├─ isVertical: boolean
├─ fontSize: number
└─ lineHeight: number
```

## StorageAdapter 架構

```
┌─────────────────────────────────────────────────────────┐
│               StorageAdapter Interface                   │
│  (lib/storage-adapter.ts)                                │
├─────────────────────────────────────────────────────────┤
│  • initialize(): Promise<void>                           │
│  • save(document): Promise<void>                         │
│  • load(id): Promise<NovelDocument | null>              │
│  • list(): Promise<NovelDocument[]>                      │
│  • delete(id): Promise<void>                             │
│  • isConnected(): boolean                                │
└──────────────┬──────────────────────────────────────────┘
               │
               │ implements
               │
       ┌───────┴──────┬──────────────┬──────────────┐
       │              │              │              │
       ▼              ▼              ▼              ▼
┌─────────────┐ ┌─────────┐ ┌─────────────┐ ┌──────────┐
│    Mock     │ │ Google  │ │  Synology   │ │  Local   │
│   Storage   │ │  Drive  │ │     NAS     │ │ Storage  │
│  (Current)  │ │ (Future)│ │  (Future)   │ │ (Future) │
└─────────────┘ └─────────┘ └─────────────┘ └──────────┘
  Memory only    OAuth 2.0    WebDAV        localStorage
                 REST API     Protocol       Browser API
```

## 資料模型

```typescript
// NovelDocument (主要實體)
{
  id: string;              // 唯一識別碼
  title: string;           // 小說標題
  content: string;         // Markdown 內容
  createdAt: Date;         // 建立時間
  updatedAt: Date;         // 最後更新時間
  chapters?: Chapter[];    // 章節列表（選用）
  metadata?: NovelMetadata;// 元資料（選用）
}

// Chapter (章節)
{
  id: string;
  title: string;
  content: string;
  order: number;           // 排序
}

// NovelMetadata (元資料)
{
  author?: string;
  description?: string;
  genre?: string;
  tags?: string[];
  wordCount?: number;
  characterCount?: number;
}
```

## 技術棧架構

```
┌──────────────────────────────────────┐
│         Presentation Layer           │
│  React 18 + Next.js 15 App Router    │
│  Tailwind CSS + Lucide Icons         │
└────────────┬─────────────────────────┘
             │
┌────────────▼─────────────────────────┐
│          Component Layer             │
│  • Navbar, Explorer, Inspector       │
│  • NovelEditor (Milkdown wrapper)    │
└────────────┬─────────────────────────┘
             │
┌────────────▼─────────────────────────┐
│           Editor Layer               │
│  Milkdown 7 + ProseMirror            │
│  • CommonMark preset                 │
│  • History, Clipboard, Cursor        │
│  • Listener (onChange)               │
└────────────┬─────────────────────────┘
             │
┌────────────▼─────────────────────────┐
│          Business Logic              │
│  • storage-context.tsx               │
│  • Character/word counting           │
│  • Auto-save logic                   │
└────────────┬─────────────────────────┘
             │
┌────────────▼─────────────────────────┐
│         Storage Layer                │
│  StorageAdapter Interface            │
│  • MockStorageAdapter (current)      │
│  • Extensible for cloud providers    │
└──────────────────────────────────────┘
```

## CSS 架構

```
globals.css
├─ Font imports (Noto Serif JP)
├─ Tailwind directives (@tailwind)
├─ CSS variables (:root)
│  ├─ --background
│  └─ --foreground
├─ Vertical writing utilities
│  └─ .vertical-writing
│     ├─ writing-mode: vertical-rl
│     └─ text-orientation: upright
├─ Milkdown customization
│  ├─ .milkdown
│  ├─ .milkdown .editor
│  └─ Typography (h1, h2, h3, p)
└─ Scrollbar styling
   └─ ::-webkit-scrollbar-*
```

## 部署架構（建議）

```
Development
├─ npm run dev (localhost:3000)
└─ Hot Module Replacement

Production
├─ Build: npm run build
│  └─ Output: .next/ folder
│
└─ Deploy Options:
   ├─ Vercel (推薦)
   │  └─ Zero-config deployment
   ├─ Netlify
   │  └─ next.config.ts 配置
   ├─ Self-hosted
   │  ├─ npm run start
   │  └─ PM2 / Docker
   └─ Static Export (if applicable)
      └─ output: 'export'
```

## 擴充點

### 1. 新增儲存提供者

```typescript
// lib/storage-google-drive.ts
export class GoogleDriveAdapter implements StorageAdapter {
  // 實現所有介面方法
}

// app/page.tsx
const adapter = new GoogleDriveAdapter();
```

### 2. 新增 Milkdown 外掛

```typescript
// components/Editor.tsx
import { emoji } from '@milkdown/plugin-emoji';

Editor.make()
  .use(commonmark)
  .use(emoji)  // 新增表情符號支援
  .use(...)
```

### 3. 新增側邊欄面板

```typescript
// components/Explorer.tsx
type Tab = "chapters" | "settings" | "style" | "export"; // 新增

// 建立新的 ExportPanel 組件
function ExportPanel() { ... }
```

## 效能考量

### 最佳化策略

1. **編輯器防抖**
   ```typescript
   const debouncedSave = useMemo(
     () => debounce(saveDocument, 1000),
     [saveDocument]
   );
   ```

2. **虛擬捲動** (大型文檔)
   - 使用 `react-window` 或 `react-virtualized`

3. **程式碼分割**
   ```typescript
   const HeavyComponent = dynamic(() => import('./Heavy'), {
     loading: () => <Spinner />,
   });
   ```

4. **圖片優化**
   ```typescript
   import Image from 'next/image';
   ```

## 安全性架構

```
Client Side
├─ Input Validation
│  └─ Sanitize user input
├─ XSS Prevention
│  └─ Markdown sanitization
└─ CSRF Protection
   └─ Next.js built-in

Storage Layer
├─ API Key Management
│  └─ Environment variables only
├─ OAuth 2.0 (Google Drive)
│  └─ Secure token storage
└─ Data Encryption
   └─ At-rest encryption (future)
```

---

**文檔版本**: 1.0  
**最後更新**: 2026-01-28  
**維護者**: Illusions Team

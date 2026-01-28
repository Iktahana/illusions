# Illusions 專案摘要

## 🎯 專案概述

**Illusions** 是一個專業級的日本語小說編輯器，基於 Next.js 15 (App Router) 和 Milkdown 編輯器框架建構。主要特色是支援日文縱書（縦書き）模式、原稿用紙換算，以及可擴展的儲存架構。

## ✅ 已實現功能

### 1. 核心編輯器
- ✅ **Milkdown 整合**: 封裝成可重用組件 (`components/Editor.tsx`)
- ✅ **Markdown 支援**: 完整的 CommonMark 規範
- ✅ **縱書模式**: `isVertical` 狀態控制，CSS `writing-mode: vertical-rl`
- ✅ **橫向捲動**: 縱書模式下自動啟用 `overflow-x: auto`
- ✅ **即時調整**: 字體大小 (14-24px)、行高 (1.5-2.5)

### 2. 三欄式佈局

#### Navbar (頂部導覽列)
- 左側：Logo (FileText icon + "Illusions")
- 中央：當前文檔標題
- 右側：保存狀態指示器 + 用戶頭像

#### Explorer (左側欄 - 256px)
三個分頁：
1. **章節管理** - 樹狀結構（預留擴充）
2. **小說設定** - 標題、作者、簡介輸入欄位
3. **風格設定** - 字體選擇、大小、行間調整

#### Inspector (右側欄 - 320px)
三個分頁：
1. **AI 助理** - 預留 API 對接槽位，包含提示輸入區
2. **即時校正** - 重複結尾、長句、助詞連續等檢測（佔位符）
3. **統計資訊** - 文字數、單詞數、原稿用紙換算（÷400）、執筆ペース

### 3. StorageAdapter 架構

**介面定義** (`lib/storage-adapter.ts`):
```typescript
interface StorageAdapter {
  initialize(): Promise<void>;
  save(document: NovelDocument): Promise<void>;
  load(documentId: string): Promise<NovelDocument | null>;
  list(): Promise<NovelDocument[]>;
  delete(documentId: string): Promise<void>;
  isConnected(): boolean;
}
```

**當前實現**:
- `MockStorageAdapter`: 記憶體內暫存（開發用）

**未來擴充**:
- `GoogleDriveAdapter`: Google Drive 同步
- `SynologyAdapter`: Synology NAS WebDAV
- `LocalStorageAdapter`: 瀏覽器 localStorage

### 4. 技術棧

| 類別 | 技術 | 版本 |
|------|------|------|
| 框架 | Next.js | 15.1.4 |
| UI 庫 | React | 18.3.1 |
| 編輯器 | Milkdown | 7.5.1 |
| 樣式 | Tailwind CSS | 3.4.17 |
| 圖標 | Lucide React | 0.469.0 |
| 語言 | TypeScript | 5.7.2 |
| 工具 | PostCSS, Autoprefixer | 8.4.49, 10.4.23 |

## 📁 專案結構

```
illusions/
├── app/
│   ├── globals.css          # 全域樣式（含縱書 CSS）
│   ├── layout.tsx           # 根佈局（HTML/head）
│   └── page.tsx             # 主頁面（三欄佈局整合）
│
├── components/
│   ├── Navbar.tsx           # 頂部導覽列（92 行）
│   ├── Explorer.tsx         # 左側欄（216 行）
│   ├── Inspector.tsx        # 右側欄（329 行）
│   └── Editor.tsx           # Milkdown 編輯器（159 行）
│
├── lib/
│   ├── storage-adapter.ts   # StorageAdapter 介面 + Mock 實現（144 行）
│   └── storage-context.tsx  # React Context 狀態管理（72 行）
│
├── public/                  # 靜態資源（預留）
│
├── 設定檔案
│   ├── package.json         # 依賴套件定義
│   ├── tsconfig.json        # TypeScript 配置
│   ├── tailwind.config.ts   # Tailwind 配置（日文字體）
│   ├── postcss.config.mjs   # PostCSS 配置
│   ├── next.config.ts       # Next.js 配置
│   └── .eslintrc.json       # ESLint 配置
│
└── 文檔
    ├── README.md            # 專案說明（英文）
    ├── PLAN.md              # 開發計畫（中文）
    ├── QUICKSTART.md        # 快速入門（日文）
    ├── CONTRIBUTING.md      # 貢獻指南（日文）
    ├── PROJECT_SUMMARY.md   # 本文件
    └── .env.example         # 環境變數範例
```

## 🎨 UI/UX 設計

### 配色方案
- **主色**: Indigo (500-700) - 按鈕、強調色
- **背景**: Slate-50 - 淡色專注模式
- **文字**: Slate-800 - 高對比可讀性
- **邊框**: Slate-200 - 細緻分隔

### 設計理念
1. **Notion 風格**: 簡潔、專注、內容優先
2. **日文優化**: Noto Serif JP 字體、縱書支援
3. **模組化**: 組件獨立、易於維護
4. **開放擴充**: 清晰的介面定義

## 🚀 快速開始

```bash
# 1. 安裝依賴
npm install

# 2. 啟動開發伺服器
npm run dev

# 3. 開啟瀏覽器
open http://localhost:3000
```

## 🔑 核心功能亮點

### 縱書實現
```tsx
// 狀態管理
const [isVertical, setIsVertical] = useState(false);

// CSS 應用
<div className={isVertical ? "vertical-writing overflow-x-auto" : ""}>
  {/* 編輯器內容 */}
</div>
```

```css
/* globals.css */
.vertical-writing {
  writing-mode: vertical-rl;
  text-orientation: upright;
}
```

### 原稿用紙換算
```typescript
// 日本標準: 20字 × 20行 = 400字/頁
const manuscriptPages = Math.ceil(charCount / 400);
```

### 自動保存
```typescript
// 編輯內容變更時觸發
const handleContentChange = async (content: string) => {
  await saveDocument({ ...currentDocument, content });
  setLastSaved(new Date());
};
```

## 📊 專案指標

- **總代碼行數**: ~1,500 行 (不含 node_modules)
- **組件數量**: 4 個主要組件
- **依賴套件**: 27 個
- **開發依賴**: 8 個
- **TypeScript 覆蓋率**: 100%

## 🛠️ 開發指令

```bash
# 開發模式 (Hot Reload)
npm run dev

# 生產建置
npm run build

# 啟動生產伺服器
npm run start

# ESLint 檢查
npm run lint

# TypeScript 型別檢查
npx tsc --noEmit
```

## 📝 待辦事項

### 高優先度
- [ ] 實現 localStorage 持久化
- [ ] 完善章節樹狀管理（拖放排序）
- [ ] AI 助理 API 整合 (OpenAI/Claude)
- [ ] 進階文法校正引擎

### 中優先度
- [ ] Google Drive 儲存整合
- [ ] Synology NAS WebDAV 支援
- [ ] 匯出功能 (PDF/EPUB/DOCX)
- [ ] 深色模式

### 低優先度
- [ ] 協作編輯 (WebSocket)
- [ ] 行動裝置最佳化
- [ ] 單元測試 & E2E 測試
- [ ] 語音輸入支援

## 🐛 已知問題

1. ~~`autoprefixer` 缺失~~ ✅ 已修復 (已安裝 v10.4.23)
2. Milkdown 編輯器在縱書模式下部分快捷鍵可能異常（待驗證）
3. 大型文檔 (>10,000 字) 可能需要效能優化

## 🔐 安全性考量

- 環境變數使用 `.env.local` (已加入 `.gitignore`)
- API 金鑰不應硬編碼
- 使用 `.env.example` 作為範本

## 📚 參考資源

- [Next.js 文檔](https://nextjs.org/docs)
- [Milkdown 文檔](https://milkdown.dev/)
- [Tailwind CSS 文檔](https://tailwindcss.com/docs)
- [Lucide Icons](https://lucide.dev/)

## 📄 授權

MIT License - 詳見 LICENSE 文件

---

**專案建立日期**: 2026-01-28  
**當前版本**: 0.1.0  
**狀態**: ✅ 基礎架構完成，可開始開發

**開發伺服器**: http://localhost:3000  
**網路位址**: http://192.168.1.20:3000

# Illusions 日文小說編輯器 - 開發計畫

## ✅ 已完成功能

### 1. 專案架構
- ✅ Next.js 15 (App Router) 初始化
- ✅ TypeScript 配置
- ✅ Tailwind CSS 整合
- ✅ ESLint 設定

### 2. 核心組件

#### 編輯器 (Editor.tsx)
- ✅ Milkdown 編輯器整合
- ✅ Markdown 支援
- ✅ **縦書き模式** - `isVertical` 狀態控制
- ✅ CSS `writing-mode: vertical-rl` 實現
- ✅ 橫向捲動支援 (`overflow-x: auto`)
- ✅ 字體大小調整 (14-24px)
- ✅ 行高調整 (1.5-2.5)
- ✅ 工具列 (縦書き切換、字體控制)

#### 導覽列 (Navbar.tsx)
- ✅ 左側：Logo (FileText icon + "Illusions")
- ✅ 中央：文檔標題顯示
- ✅ 右側：保存狀態 + 用戶頭像
- ✅ 即時保存狀態指示器

#### 左側欄 (Explorer.tsx)
- ✅ 三個分頁：章節、設定、風格
- ✅ **章節管理**：樹狀結構預留（可擴充）
- ✅ **小說設定**：標題、作者、簡介輸入
- ✅ **風格設定**：字體選擇、字體大小、行間調整

#### 右側欄 (Inspector.tsx)
- ✅ 三個分頁：AI、校正、統計
- ✅ **AI 助理**：預留 API 對接槽位
- ✅ **即時校正**：重複結尾、長句、助詞連續檢測（佔位符）
- ✅ **字數統計**：
  - 文字數 (charCount)
  - 單詞數 (wordCount)
  - **原稿用紙換算** (字數/400)
  - 段落數
  - 執筆ペース統計

### 3. 資料架構

#### StorageAdapter 介面 (storage-adapter.ts)
- ✅ `initialize()` - 初始化連接
- ✅ `save()` - 保存文檔
- ✅ `load()` - 載入文檔
- ✅ `list()` - 列出所有文檔
- ✅ `delete()` - 刪除文檔
- ✅ `isConnected()` - 檢查連接狀態

#### MockStorageAdapter
- ✅ 記憶體內暫存實現
- ✅ 範例文檔載入
- ✅ 完整 CRUD 操作

#### StorageContext (storage-context.tsx)
- ✅ React Context API 整合
- ✅ `useStorage` Hook
- ✅ 全域文檔狀態管理
- ✅ 自動初始化

### 4. 佈局設計
- ✅ 三欄式佈局 (Explorer + Editor + Inspector)
- ✅ 響應式高度管理
- ✅ 獨立捲動區域
- ✅ Notion 風格簡潔 UI
- ✅ Slate-50 淡色背景

### 5. 樣式系統
- ✅ Google Fonts (Noto Serif JP)
- ✅ 日文字體堆疊
- ✅ 自訂捲動條樣式
- ✅ Vertical writing CSS 支援
- ✅ Milkdown 編輯器樣式自訂

---

## 🚀 未來擴充功能

### Phase 1: 儲存整合
- [ ] **Google Drive Adapter** 實現
  - OAuth 2.0 認證
  - 檔案讀寫 API
  - 即時同步
- [ ] **Synology NAS Adapter** 實現
  - WebDAV 協定
  - 本地網路連接
  - 檔案版本控制

### Phase 2: AI 功能
- [ ] **AI 助理 API 整合**
  - OpenAI GPT-4 / Claude API
  - 情節建議
  - 角色發展提案
  - 文體優化
- [ ] **進階校正**
  - 文法檢查引擎
  - 重複表現檢測
  - 文體一致性分析
  - 校對建議列表

### Phase 3: 編輯器增強
- [ ] **章節樹狀管理**
  - 拖放排序
  - 章節折疊/展開
  - 快速跳轉
- [ ] **版本歷史**
  - 自動快照
  - 差異比較
  - 回復功能
- [ ] **協作編輯**
  - 多人即時編輯
  - 游標同步
  - 評論系統

### Phase 4: 匯出與發布
- [ ] **匯出格式**
  - PDF (縦書き支援)
  - EPUB (電子書)
  - DOCX (Word)
  - 青空文庫格式
- [ ] **發布整合**
  - カクヨム API
  - 小説家になろう
  - note.com

### Phase 5: 進階功能
- [ ] **深色模式**
- [ ] **行動裝置最佳化**
- [ ] **鍵盤快捷鍵**
- [ ] **自訂主題**
- [ ] **語音輸入**
- [ ] **朗讀功能** (TTS)

---

## 📊 技術債務

### 效能優化
- [ ] 編輯器防抖 (debounce) 優化
- [ ] 大型文檔虛擬捲動
- [ ] 圖片延遲載入

### 測試
- [ ] 單元測試 (Jest)
- [ ] 整合測試 (Playwright)
- [ ] E2E 測試

### 文檔
- [ ] API 文檔
- [ ] 組件使用指南
- [ ] 貢獻者指南

---

## 🎯 近期優先事項

1. **完善 StorageAdapter**
   - 實現 localStorage 持久化
   - 加入匯出/匯入功能

2. **編輯器功能**
   - 加入更多 Markdown 外掛
   - 圖片上傳支援
   - 表格編輯

3. **UI/UX 改善**
   - 加入載入動畫
   - 錯誤提示優化
   - 鍵盤導航增強

4. **字數統計精進**
   - 排除 Markdown 標記
   - 更精確的日文字數計算
   - 即時統計更新

---

## 🔧 開發指令

```bash
# 開發模式
npm run dev

# 建置生產版本
npm run build

# 啟動生產伺服器
npm run start

# Lint 檢查
npm run lint
```

---

## 📝 注意事項

### 縦書き實現細節
```css
.vertical-writing {
  writing-mode: vertical-rl;  /* 右到左垂直書寫 */
  text-orientation: upright;  /* 文字直立 */
}
```

### 原稿用紙換算公式
```typescript
const manuscriptPages = Math.ceil(charCount / 400);
```
- 日本標準原稿用紙：20字 × 20行 = 400字/頁

### StorageAdapter 擴充範例
```typescript
export class GoogleDriveAdapter implements StorageAdapter {
  private driveClient: any;
  
  async initialize() {
    // OAuth 認證
    this.driveClient = await initGoogleDrive();
  }
  
  async save(document: NovelDocument) {
    // 上傳至 Google Drive
    await this.driveClient.files.update({...});
  }
  
  // ... 其他方法
}
```

---

## 🎨 設計理念

1. **專注寫作**：減少干擾，最大化內容區域
2. **日文優先**：縦書き、原稿用紙換算等日式功能
3. **模組化**：組件獨立，易於維護擴充
4. **開源精神**：清晰的介面定義，方便社群貢獻

---

最後更新：2026-01-28

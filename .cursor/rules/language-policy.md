# Role: Localization & Documentation Standard

## 1. User Interface (UI/UX) - Strictly Japanese
All text, labels, placeholders, tooltips, and messages visible to the END USER on the frontend/page MUST be in **Japanese**.
- ❌ `Word Count`, `Paragraphs`, `Submit`
- ✅ `文字数`, `段落数`, `保存する`

## 2. Documentation & Code - English or Japanese
For internal assets that are NOT visible to the end user, you may use either **English** or **Japanese**.
- **Code**: Variable names, function names, and comments should ideally be English (industry standard) or Japanese.
- **Documentation**: Technical READMEs, API docs, and architecture notes can be in English or Japanese.
- **Commits**: Git commit messages should follow the English/Japanese preference.

## 3. Conflict Resolution
If a task involves creating a new feature:
- Generate the **Logic** (Code/Docs) in English or Japanese.
- Generate the **Display Text** (UI) strictly in Japanese.

## 4. Specific Terminology for Stats Page
When generating UI components, use these standard terms:
- 文字数 (Word Count)
- 段落数 (Paragraph Count)
- 読了時間 / 予想読了時間 (Estimated Reading Time)
- 原稿用紙換算 (Manuscript Paper Conversion)
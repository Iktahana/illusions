import { describe, it, expect } from "vitest";

import {
  extractVisibleText,
  countVisibleChars,
  countManuscriptCells,
  countManuscriptPages,
  countParagraphs,
  computeTextStatistics,
} from "../text-statistics";

// ---------------------------------------------------------------------------
// extractVisibleText
// ---------------------------------------------------------------------------
describe("extractVisibleText", () => {
  it("Markdown 見出し記号を除去して本文を残す", () => {
    expect(extractVisibleText("# 第一章")).toBe("第一章");
  });

  it("MDI ルビを親文字のみにする", () => {
    expect(extractVisibleText("{東京|とうきょう}")).toBe("東京");
  });

  it("MDI 縦中横を内容のみにする", () => {
    expect(extractVisibleText("^12^")).toBe("12");
  });

  it("MDI no-break を内容のみにする", () => {
    expect(extractVisibleText("[[no-break:東京都]]")).toBe("東京都");
  });

  it("MDI kern を内容のみにする", () => {
    expect(extractVisibleText("[[kern:-0.1em:確実]]")).toBe("確実");
  });

  it("HTML タグを除去して内容を残す", () => {
    expect(extractVisibleText("<b>太字</b>")).toBe("太字");
  });

  it("インラインコードを全削除する", () => {
    expect(extractVisibleText("`use const here`")).toBe("");
  });

  it("画像を全削除する（alt も含め）", () => {
    expect(extractVisibleText("![alt](image.png)")).toBe("");
  });

  it("リンクをテキスト部分のみにする", () => {
    expect(extractVisibleText("[クリック](https://example.com)")).toBe("クリック");
  });

  it("コードブロックを全削除する", () => {
    expect(extractVisibleText("```\nconst x = 1;\n```")).toBe("");
  });

  it("強調記号を除去して内容を残す (**)", () => {
    expect(extractVisibleText("**太字**")).toBe("太字");
  });

  it("強調記号を除去して内容を残す (*)", () => {
    expect(extractVisibleText("*斜体*")).toBe("斜体");
  });

  it("強調記号を除去して内容を残す (_)", () => {
    expect(extractVisibleText("_italic_")).toBe("italic");
  });

  it("語中のアンダースコアは強調として扱わない", () => {
    expect(extractVisibleText("file_name_here")).toBe("file_name_here");
  });

  it("打ち消し線を除去して内容を残す (~~)", () => {
    expect(extractVisibleText("~~削除~~")).toBe("削除");
  });

  it("バックスラッシュエスケープを処理する", () => {
    expect(extractVisibleText("\\{")).toBe("{");
  });

  it("複合記法を正しく処理する", () => {
    const input = "# タイトル\n{東京|とうきょう}の**中心部**で[[no-break:打ち合わせ]]をした。";
    const result = extractVisibleText(input);
    expect(result).toBe("タイトル\n東京の中心部で打ち合わせをした。");
  });

  it("ルビのドット区切り表記を親文字のみにする", () => {
    expect(extractVisibleText("{雪女|ゆき.おんな}")).toBe("雪女");
  });
});

// ---------------------------------------------------------------------------
// countVisibleChars
// ---------------------------------------------------------------------------
describe("countVisibleChars", () => {
  it("通常の日本語文字列をカウントする", () => {
    expect(countVisibleChars("東京")).toBe(2);
  });

  it("改行は数えない", () => {
    expect(countVisibleChars("東京\n大阪")).toBe(4);
  });

  it("スペースは数えない", () => {
    expect(countVisibleChars("東京 大阪")).toBe(4);
  });

  it("全角スペースは数えない", () => {
    expect(countVisibleChars("東京　大阪")).toBe(4);
  });

  it("空文字列は 0", () => {
    expect(countVisibleChars("")).toBe(0);
  });

  it("タブは数えない", () => {
    expect(countVisibleChars("あ\tい")).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// countManuscriptCells
// ---------------------------------------------------------------------------
describe("countManuscriptCells", () => {
  it("空文字列は 0", () => {
    expect(countManuscriptCells("")).toBe(0);
  });

  it("1文字のみ → 1行消費（20マス）", () => {
    expect(countManuscriptCells("あ")).toBe(20);
  });

  it("20文字ちょうど → 1行消費（20マス）", () => {
    expect(countManuscriptCells("あ".repeat(20))).toBe(20);
  });

  it("21文字 → 2行消費（40マス）", () => {
    expect(countManuscriptCells("あ".repeat(21))).toBe(40);
  });

  it("改行1つ（'あ\\nあ'）→ 2行消費（40マス）", () => {
    expect(countManuscriptCells("あ\nあ")).toBe(40);
  });

  it("400文字ちょうど → 1ページ（400マス）", () => {
    expect(countManuscriptCells("あ".repeat(400))).toBe(400);
  });

  it("401文字 → 21行（420マス）", () => {
    // 401 chars / 20 chars per line = 20 full lines + 1 char = 21 lines × 20 = 420 cells
    expect(countManuscriptCells("あ".repeat(401))).toBe(420);
  });

  it("空行は1行を消費する", () => {
    // '\\n\\n' は空行を含む3行相当
    // 行1: 空、行2: 空、行3: 空 → 3行 = 60マス
    expect(countManuscriptCells("\n\n")).toBe(60);
  });

  it("40行相当の短文改行 → 800マス（2ページ分）", () => {
    const text = Array.from({ length: 40 }, () => "あ").join("\n");
    expect(countManuscriptCells(text)).toBe(800);
  });
});

// ---------------------------------------------------------------------------
// countManuscriptPages
// ---------------------------------------------------------------------------
describe("countManuscriptPages", () => {
  it("0マス → 0ページ", () => {
    expect(countManuscriptPages(0)).toBe(0);
  });

  it("400マス → 1ページ", () => {
    expect(countManuscriptPages(400)).toBe(1);
  });

  it("401マス → 2ページ（切り上げ）", () => {
    expect(countManuscriptPages(401)).toBe(2);
  });

  it("800マス → 2ページ", () => {
    expect(countManuscriptPages(800)).toBe(2);
  });

  it("20マス → 1ページ（切り上げ）", () => {
    expect(countManuscriptPages(20)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// countParagraphs
// ---------------------------------------------------------------------------
describe("countParagraphs", () => {
  it("空文字列は 0", () => {
    expect(countParagraphs("")).toBe(0);
  });

  it("空白のみは 0", () => {
    expect(countParagraphs("   ")).toBe(0);
  });

  it("1段落は 1", () => {
    expect(countParagraphs("こんにちは")).toBe(1);
  });

  it("改行で区切られた2段落は 2", () => {
    expect(countParagraphs("段落1\n段落2")).toBe(2);
  });

  it("空行連続は1区切りとして扱う", () => {
    expect(countParagraphs("段落1\n\n段落2")).toBe(2);
  });

  it("空行のみの段落は数えない", () => {
    expect(countParagraphs("\n\n段落1\n\n")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// computeTextStatistics（統合）
// ---------------------------------------------------------------------------
describe("computeTextStatistics", () => {
  it("空文字列は全て 0", () => {
    const stats = computeTextStatistics("");
    expect(stats.visibleTextCharCount).toBe(0);
    expect(stats.manuscriptCellCount).toBe(0);
    expect(stats.manuscriptPages).toBe(0);
    expect(stats.paragraphCount).toBe(0);
  });

  it("MDI ルビ付きテキストを正しく計算する", () => {
    // {東京|とうきょう} → 「東京」2文字 → 1行 = 20マス → 1ページ
    const stats = computeTextStatistics("{東京|とうきょう}");
    expect(stats.visibleTextCharCount).toBe(2);
    expect(stats.manuscriptCellCount).toBe(20);
    expect(stats.manuscriptPages).toBe(1);
  });

  it("400字 → 1ページ", () => {
    const stats = computeTextStatistics("あ".repeat(400));
    expect(stats.manuscriptPages).toBe(1);
  });

  it("401字 → 2ページ（420マス / 400 = 切り上げ2）", () => {
    const stats = computeTextStatistics("あ".repeat(401));
    expect(stats.manuscriptPages).toBe(2);
    expect(stats.manuscriptCellCount).toBe(420);
  });

  it("複数段落の段落数を正しくカウントする", () => {
    const stats = computeTextStatistics("段落1\n\n段落2\n\n段落3");
    expect(stats.paragraphCount).toBe(3);
  });

  it("Markdown 記法入り文章を正しく処理する", () => {
    const stats = computeTextStatistics("# 見出し\n**太字テキスト**");
    // 「見出し」3字 + 「太字テキスト」6字 = 9字（改行は除く）
    expect(stats.visibleTextCharCount).toBe(9);
  });

  it("MDI 縦中横 ^12^ は本文文字数 2", () => {
    const stats = computeTextStatistics("^12^");
    expect(stats.visibleTextCharCount).toBe(2);
  });

  it("MDI no-break [[no-break:東京都]] は本文文字数 3", () => {
    const stats = computeTextStatistics("[[no-break:東京都]]");
    expect(stats.visibleTextCharCount).toBe(3);
  });

  it("MDI kern [[kern:-0.1em:確実]] は本文文字数 2", () => {
    const stats = computeTextStatistics("[[kern:-0.1em:確実]]");
    expect(stats.visibleTextCharCount).toBe(2);
  });

  it("HTML タグ <b>太字</b> は本文文字数 2", () => {
    const stats = computeTextStatistics("<b>太字</b>");
    expect(stats.visibleTextCharCount).toBe(2);
  });

  it("画像構文 ![alt](image.png) は本文文字数 0", () => {
    const stats = computeTextStatistics("![alt](image.png)");
    expect(stats.visibleTextCharCount).toBe(0);
  });

  it("インラインコード は本文文字数 0", () => {
    const stats = computeTextStatistics("`use const here`");
    expect(stats.visibleTextCharCount).toBe(0);
  });

  it("「あ」×1行 × 40行 → 原稿用紙換算 2 枚", () => {
    // 40行 × 20マス/行 = 800マス → ceil(800/400) = 2ページ
    const text = Array.from({ length: 40 }, () => "あ").join("\n");
    const stats = computeTextStatistics(text);
    expect(stats.manuscriptCellCount).toBe(800);
    expect(stats.manuscriptPages).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 禁則処理のテスト
// ---------------------------------------------------------------------------
describe("countManuscriptCells (禁則処理)", () => {
  it("行頭禁則文字（。）が行頭に来る場合は前行に押し込む", () => {
    // 20文字（ちょうど1行）+ 行頭禁則文字「。」
    // → 「。」を前行に押し込むため、1行で収まる
    const text = "あ".repeat(20) + "。";
    const cells = countManuscriptCells(text);
    // 禁則処理で「。」は前行に押し込まれるため、行数は1のまま
    expect(cells).toBe(20);
  });

  it("行末禁則文字（「）が行末に来る場合は次行に追い出す", () => {
    // 20文字のうち最後が「（行末禁則文字）→ 次行に追い出す
    const text = "あ".repeat(19) + "「" + "あ";
    const cells = countManuscriptCells(text);
    // 「は次行先頭へ移動するため、2行 = 40マス
    expect(cells).toBe(40);
  });
});

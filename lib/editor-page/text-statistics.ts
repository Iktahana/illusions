/**
 * Pure functions for Japanese manuscript (原稿用紙) statistics.
 *
 * All functions are side-effect-free and can be used both in React hooks
 * and in plain Node.js / test environments.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * 原稿用紙換算統計
 */
export interface TextStatistics {
  /** 可視本文文字数（空白・改行・記法を除く） */
  visibleTextCharCount: number;
  /** 原稿用紙マス数（20×20、禁則処理あり） */
  manuscriptCellCount: number;
  /** 原稿用紙換算枚数（切り上げ） */
  manuscriptPages: number;
  /** 段落数 */
  paragraphCount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 1行あたりの文字数（原稿用紙 20×20） */
const CHARS_PER_LINE = 20;

/** 1ページあたりの行数 */
const LINES_PER_PAGE = 20;

/** 1ページあたりのマス数 */
const CELLS_PER_PAGE = CHARS_PER_LINE * LINES_PER_PAGE; // 400

/** 行頭禁則文字（行頭に置いてはならない文字） */
const LINE_HEAD_PROHIBITED = new Set(
  "、。，．）〕］｝〉》」』】ぁぃぅぇぉっゃゅょァィゥェォッャュョー！？".split(""),
);

/** 行末禁則文字（行末に置いてはならない文字） */
const LINE_END_PROHIBITED = new Set("（〔［｛〈《「『【".split(""));

// ---------------------------------------------------------------------------
// extractVisibleText
// ---------------------------------------------------------------------------

/**
 * Markdown / MDI / HTML のマークアップを除去し、可視本文テキストを返す。
 *
 * 除去ルール（この順番で適用）:
 *  1. コードブロック (` ``` ... ``` `) → 全削除
 *  2. インラインコード (`` `...` ``) → 全削除
 *  3. 画像 (`![alt](url)`) → 全削除（alt 含め）
 *  4. リンク (`[text](url)`) → text のみ残す
 *  5. MDI ルビ (`{親文字|ルビ}`) → 親文字のみ
 *  6. MDI 縦中横 (`^内容^`) → 内容のみ
 *  7. MDI no-break (`[[no-break:文字列]]`) → 文字列のみ
 *  8. MDI kern (`[[kern:量:文字列]]`) → 文字列のみ
 *  9. HTML タグ (`<tag>`) → タグ記号のみ除去、内容は残す
 * 10. Markdown 見出し記号（行頭の `#+ `）→ 除去（本文は残す）
 * 11. 強調記号 (`**...**`, `__...__`, `*...*`, `_..._`, `~~...~~`) → 内容は残す
 * 12. バックスラッシュエスケープ (`\X`) → バックスラッシュのみ除去
 */
export function extractVisibleText(rawContent: string): string {
  let text = rawContent;

  // 1. コードブロック（```...```、フェンス含む）
  text = text.replace(/```[\s\S]*?```/g, "");

  // 2. インラインコード
  text = text.replace(/`[^`]*`/g, "");

  // 3. 画像（alt も除去）
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, "");

  // 4. リンク → テキスト部分のみ残す
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");

  // 5. MDI ルビ {親文字|ルビ} → 親文字のみ
  text = text.replace(/\{([^|{}]*)\|[^}]*\}/g, "$1");

  // 6. MDI 縦中横 ^内容^ → 内容のみ
  text = text.replace(/\^([^^]*)\^/g, "$1");

  // 7. MDI no-break [[no-break:文字列]] → 文字列のみ
  text = text.replace(/\[\[no-break:([^\]]*)\]\]/g, "$1");

  // 8. MDI kern [[kern:量:文字列]] → 文字列のみ
  text = text.replace(/\[\[kern:[^\]]*?:([^\]]*)\]\]/g, "$1");

  // 9. HTML タグ → タグ記号を除去、内容は残す
  text = text.replace(/<[^>]*>/g, "");

  // 10. Markdown 見出し記号（行頭の # 記号と直後のスペース）
  text = text.replace(/^#{1,6} /gm, "");

  // 11. 強調記号のみ除去（内容は残す）
  // ** と __ を先に処理してから単体 * と _ を処理する順番を守ること。
  text = text.replace(/~~([^~]*)~~/g, "$1");
  text = text.replace(/\*\*([^*]*)\*\*/g, "$1");
  text = text.replace(/__([^_]*)__/g, "$1");
  // 単体 * / _ は語中の記号との誤マッチを防ぐため語境界（非 ASCII も考慮）を要求する。
  // 例: file_name_here の _ は強調として扱わない（\w で囲まれているため不一致）。
  text = text.replace(/(?<!\*)\*(?!\*)([^*\n]+?)(?<!\*)\*(?!\*)/g, "$1");
  text = text.replace(/(?<!\w)_(?!_)([^_\n]+?)_(?!\w)(?!_)/g, "$1");

  // 12. バックスラッシュエスケープ（バックスラッシュのみ除去）
  text = text.replace(/\\(.)/g, "$1");

  return text;
}

// ---------------------------------------------------------------------------
// countVisibleChars
// ---------------------------------------------------------------------------

/**
 * 可視本文文字数を返す（空白・改行を除く）。
 *
 * @param visibleText - `extractVisibleText` で処理済みのテキスト
 */
export function countVisibleChars(visibleText: string): number {
  // Array.from でサロゲートペア対応
  return Array.from(visibleText).filter((ch) => !/\s/.test(ch)).length;
}

// ---------------------------------------------------------------------------
// countManuscriptCells
// ---------------------------------------------------------------------------

/**
 * 原稿用紙マス数を返す（20×20、禁則処理あり）。
 *
 * 仕様:
 * - 基本的には 1文字 = 1マスとして扱う（ただし禁則処理による近似あり、後述）
 * - 1行 = 20マス（`CHARS_PER_LINE`）、1ページ = 20行 = 400マス（`CELLS_PER_PAGE`）
 * - 明示改行（`\n`）でその行の残りマスをスキップして次行へ
 * - 空行は1行として扱う（20マス消費）
 * - 戻り値は「消費したマス数の合計（空白マスを含む）」
 *
 * 禁則処理:
 * - 行頭禁則文字が行頭に来ようとする場合 → 前行へ押し込む（追い出し）
 * - 行末禁則文字が行末に来た場合（次文字あり）→ 行末禁則文字を次行頭へ追い出す
 * - この追い出し処理により、1行が CHARS_PER_LINE を超えることがある（ぶら下げ近似）。
 *   戻り値は lines.length × CHARS_PER_LINE で計算するため枚数計算への影響はないが、
 *   厳密に「1文字 = 1マス」とはならないケースが存在する
 *
 * @param visibleText - `extractVisibleText` で処理済みのテキスト（改行を含む）
 */
export function countManuscriptCells(visibleText: string): number {
  if (visibleText.length === 0) {
    return 0;
  }

  // テキストを段落（改行区切り）に分割してシミュレーション
  const paragraphs = visibleText.split("\n");
  let totalLines = 0;

  for (const paragraph of paragraphs) {
    // 空段落（空行）は1行を消費
    const chars = Array.from(paragraph);
    if (chars.length === 0) {
      totalLines += 1;
      continue;
    }

    // 禁則処理を考慮しながら行に文字を配置する
    totalLines += simulateLineBreaks(chars);
  }

  return totalLines * CHARS_PER_LINE;
}

/**
 * 1段落分の文字を原稿用紙行に配置し、消費行数を返す。
 * 禁則処理（行頭禁則・行末禁則）を適用する。
 */
function simulateLineBreaks(chars: string[]): number {
  // 注: chars が空の場合は呼び出し元（countManuscriptCells）で除外済み。
  // このガードは防衛的コードとして残す。
  if (chars.length === 0) return 1;

  const lines: string[][] = [[]];

  for (const ch of chars) {
    const currentLine = lines[lines.length - 1];

    if (currentLine.length < CHARS_PER_LINE) {
      // 通常配置
      currentLine.push(ch);
    } else {
      // 行が満杯 → 新しい行へ
      lines.push([ch]);
    }
  }

  // 禁則処理を適用
  applyKinsoku(lines);

  return lines.length;
}

/**
 * 行末禁則・行頭禁則の処理を行配列に適用する（インプレース変更）。
 */
function applyKinsoku(lines: string[][]): void {
  // 複数パスで安定するまで繰り返す（禁則が連鎖することがある）
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = lines[i + 1];

      // 行末禁則: 現在行の最後の文字が行末禁則文字で、次行がある場合
      // → 最後の文字を次行の先頭に移動（追い出し）
      if (nextLine !== undefined && line.length > 0) {
        const lastChar = line[line.length - 1];
        if (LINE_END_PROHIBITED.has(lastChar)) {
          line.pop();
          nextLine.unshift(lastChar);
          changed = true;
        }
      }

      // 行頭禁則: 次行の最初の文字が行頭禁則文字の場合
      // → 現在行へ押し込む（追い込み）。
      // 行詰め処理のため、前行の文字数が CHARS_PER_LINE を超えることがある。
      // セル数は lines.length × CHARS_PER_LINE で計算するため枚数計算には影響しない。
      if (nextLine !== undefined && nextLine.length > 0) {
        const firstChar = nextLine[0];
        if (LINE_HEAD_PROHIBITED.has(firstChar)) {
          nextLine.shift();
          line.push(firstChar);
          changed = true;
        }
      }
    }

    // 空になった行を除去（ただし最初の行は残す）
    for (let i = lines.length - 1; i > 0; i--) {
      if (lines[i].length === 0) {
        lines.splice(i, 1);
      }
    }

    if (!changed) break;
  }
}

// ---------------------------------------------------------------------------
// countManuscriptPages
// ---------------------------------------------------------------------------

/**
 * 原稿用紙換算枚数を返す（端数切り上げ）。
 *
 * @param manuscriptCells - `countManuscriptCells` で計算したマス数
 */
export function countManuscriptPages(manuscriptCells: number): number {
  if (manuscriptCells === 0) return 0;
  return Math.ceil(manuscriptCells / CELLS_PER_PAGE);
}

// ---------------------------------------------------------------------------
// countParagraphs
// ---------------------------------------------------------------------------

/**
 * 段落数を返す。
 * 空でない行を含む段落（改行区切り）を数える。
 * 空行連続は1つの区切りとして扱う。
 *
 * @param visibleText - `extractVisibleText` で処理済みのテキスト
 */
export function countParagraphs(visibleText: string): number {
  if (!visibleText.trim()) return 0;
  // 空でない行を含む段落を数える
  return visibleText.split(/\n+/).filter((p) => p.trim().length > 0).length;
}

// ---------------------------------------------------------------------------
// computeTextStatistics
// ---------------------------------------------------------------------------

/**
 * TextStatistics オブジェクトを一括計算する。
 *
 * @param rawContent - エディタの生コンテンツ（Markdown/MDI/HTML 記法を含む可能性あり）
 */
export function computeTextStatistics(rawContent: string): TextStatistics {
  const visibleText = extractVisibleText(rawContent);
  const visibleTextCharCount = countVisibleChars(visibleText);
  const manuscriptCellCount = countManuscriptCells(visibleText);
  const manuscriptPages = countManuscriptPages(manuscriptCellCount);
  const paragraphCount = countParagraphs(visibleText);

  return {
    visibleTextCharCount,
    manuscriptCellCount,
    manuscriptPages,
    paragraphCount,
  };
}

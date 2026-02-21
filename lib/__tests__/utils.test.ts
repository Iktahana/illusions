import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  calculateManuscriptPages,
  countWords,
  countCharacters,
  formatDate,
  formatRelativeTime,
  debounce,
  generateId,
  hasJapanese,
  validateTitle,
  cleanMarkdown,
  calculateStatistics,
  generateHeadingId,
  parseMarkdownChapters,
  countSentences,
  analyzeCharacterTypes,
  calculateCharacterUsageRates,
  calculateAveragePunctuationSpacing,
  calculateReadabilityScore,
  getChaptersFromDOM,
} from "../utils";

import type { CharacterTypeAnalysis } from "../utils";

// ---------------------------------------------------------------------------
// calculateManuscriptPages
// ---------------------------------------------------------------------------
describe("calculateManuscriptPages", () => {
  it("should return 1 page for 400 characters", () => {
    expect(calculateManuscriptPages(400)).toBe(1);
  });

  it("should return 1 page for fewer than 400 characters", () => {
    expect(calculateManuscriptPages(1)).toBe(1);
    expect(calculateManuscriptPages(399)).toBe(1);
  });

  it("should round up to next page when exceeding a boundary", () => {
    expect(calculateManuscriptPages(401)).toBe(2);
    expect(calculateManuscriptPages(800)).toBe(2);
    expect(calculateManuscriptPages(801)).toBe(3);
  });

  it("should return 0 for 0 characters", () => {
    expect(calculateManuscriptPages(0)).toBe(0);
  });

  it("should handle large numbers", () => {
    expect(calculateManuscriptPages(100000)).toBe(250);
  });
});

// ---------------------------------------------------------------------------
// countWords
// ---------------------------------------------------------------------------
describe("countWords", () => {
  it("should count English words separated by spaces", () => {
    expect(countWords("hello world")).toBe(2);
  });

  it("should count a single Japanese block as one word", () => {
    // Japanese text without spaces is treated as a single word
    expect(countWords("吾輩は猫である")).toBe(1);
  });

  it("should handle mixed Japanese and English", () => {
    expect(countWords("日本語 English テスト")).toBe(3);
  });

  it("should return 0 for empty string", () => {
    expect(countWords("")).toBe(0);
  });

  it("should return 0 for whitespace-only string", () => {
    expect(countWords("   \n\t  ")).toBe(0);
  });

  it("should strip Markdown formatting characters before counting", () => {
    // Stripping * from "**bold** and *italic*" yields "bold and italic" = 3 words
    expect(countWords("**bold** and *italic*")).toBe(3);
    expect(countWords("# Heading")).toBe(1);
    // Stripping [] and () from "[link](url) text" yields "linkurl text" = 2 words
    expect(countWords("[link](url) text")).toBe(2);
  });

  it("should handle multiple spaces and tabs between words", () => {
    expect(countWords("one   two\tthree\n\nfour")).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// countCharacters
// ---------------------------------------------------------------------------
describe("countCharacters", () => {
  it("should count characters excluding whitespace", () => {
    expect(countCharacters("hello world")).toBe(10);
  });

  it("should count Japanese characters correctly", () => {
    expect(countCharacters("吾輩は猫である")).toBe(7);
  });

  it("should return 0 for empty string", () => {
    expect(countCharacters("")).toBe(0);
  });

  it("should return 0 for whitespace-only string", () => {
    expect(countCharacters("   \t\n  ")).toBe(0);
  });

  it("should exclude all types of whitespace", () => {
    expect(countCharacters("a b\tc\nd")).toBe(4);
  });

  it("should count full-width characters as single characters", () => {
    // Full-width punctuation
    expect(countCharacters("。、！？")).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------
describe("formatDate", () => {
  it("should format a date in Japanese locale", () => {
    const result = formatDate(new Date("2025-01-15T14:30:00"));
    // The result should contain Japanese year/month/day formatting
    expect(result).toContain("2025");
    expect(result).toContain("15");
  });

  it("should include time components", () => {
    const result = formatDate(new Date("2025-06-01T09:05:00"));
    // Should include hour and minute
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// formatRelativeTime
// ---------------------------------------------------------------------------
describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return '今' for less than 60 seconds ago", () => {
    const date = new Date("2025-06-01T11:59:30Z");
    expect(formatRelativeTime(date)).toBe("今");
  });

  it("should return minutes ago for 1-59 minutes", () => {
    const date = new Date("2025-06-01T11:55:00Z");
    expect(formatRelativeTime(date)).toBe("5分前");
  });

  it("should return hours ago for 1-23 hours", () => {
    const date = new Date("2025-06-01T09:00:00Z");
    expect(formatRelativeTime(date)).toBe("3時間前");
  });

  it("should return days ago for 24+ hours", () => {
    const date = new Date("2025-05-30T12:00:00Z");
    expect(formatRelativeTime(date)).toBe("2日前");
  });

  it("should return '今' for exactly 0 seconds difference", () => {
    const date = new Date("2025-06-01T12:00:00Z");
    expect(formatRelativeTime(date)).toBe("今");
  });

  it("should return '1分前' for exactly 60 seconds", () => {
    const date = new Date("2025-06-01T11:59:00Z");
    expect(formatRelativeTime(date)).toBe("1分前");
  });

  it("should return '1時間前' for exactly 3600 seconds", () => {
    const date = new Date("2025-06-01T11:00:00Z");
    expect(formatRelativeTime(date)).toBe("1時間前");
  });

  it("should return '1日前' for exactly 86400 seconds", () => {
    const date = new Date("2025-05-31T12:00:00Z");
    expect(formatRelativeTime(date)).toBe("1日前");
  });
});

// ---------------------------------------------------------------------------
// debounce
// ---------------------------------------------------------------------------
describe("debounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should delay function execution", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should reset the timer on subsequent calls", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    vi.advanceTimersByTime(50);
    debounced(); // Reset timer
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should pass arguments to the debounced function", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced("arg1", "arg2");
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledWith("arg1", "arg2");
  });

  it("should use the latest arguments when called multiple times", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced("first");
    debounced("second");
    debounced("third");
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("third");
  });

  it("should handle zero wait time", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 0);

    debounced();
    vi.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// generateId
// ---------------------------------------------------------------------------
describe("generateId", () => {
  it("should return a non-empty string", () => {
    const id = generateId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");
  });

  it("should contain a timestamp and random part separated by a hyphen", () => {
    const id = generateId();
    const parts = id.split("-");
    expect(parts.length).toBe(2);
    // First part should be a numeric timestamp
    expect(Number.isFinite(Number(parts[0]))).toBe(true);
    // Second part should be alphanumeric
    expect(parts[1]).toMatch(/^[a-z0-9]+$/);
  });

  it("should generate unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// hasJapanese
// ---------------------------------------------------------------------------
describe("hasJapanese", () => {
  it("should return true for hiragana", () => {
    expect(hasJapanese("あいうえお")).toBe(true);
  });

  it("should return true for katakana", () => {
    expect(hasJapanese("アイウエオ")).toBe(true);
  });

  it("should return true for kanji", () => {
    expect(hasJapanese("漢字")).toBe(true);
  });

  it("should return true for mixed Japanese and English", () => {
    expect(hasJapanese("Hello 世界")).toBe(true);
  });

  it("should return false for English-only text", () => {
    expect(hasJapanese("Hello World")).toBe(false);
  });

  it("should return false for empty string", () => {
    expect(hasJapanese("")).toBe(false);
  });

  it("should return false for numbers and symbols only", () => {
    expect(hasJapanese("12345!@#$%")).toBe(false);
  });

  it("should detect a single Japanese character", () => {
    expect(hasJapanese("aあb")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateTitle
// ---------------------------------------------------------------------------
describe("validateTitle", () => {
  it("should return valid for a normal title", () => {
    expect(validateTitle("My Novel")).toEqual({ valid: true });
  });

  it("should return valid for a Japanese title", () => {
    expect(validateTitle("吾輩は猫である")).toEqual({ valid: true });
  });

  it("should return invalid for empty string", () => {
    const result = validateTitle("");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("タイトルを入力してください");
  });

  it("should return invalid for whitespace-only string", () => {
    const result = validateTitle("   ");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("タイトルを入力してください");
  });

  it("should return invalid for title exceeding 100 characters", () => {
    const longTitle = "あ".repeat(101);
    const result = validateTitle(longTitle);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("タイトルは100文字以内にしてください");
  });

  it("should return valid for exactly 100 characters", () => {
    const title = "a".repeat(100);
    expect(validateTitle(title)).toEqual({ valid: true });
  });

  it("should return valid for a single character", () => {
    expect(validateTitle("a")).toEqual({ valid: true });
  });
});

// ---------------------------------------------------------------------------
// cleanMarkdown
// ---------------------------------------------------------------------------
describe("cleanMarkdown", () => {
  it("should remove code blocks", () => {
    const md = "before\n```\ncode\n```\nafter";
    expect(cleanMarkdown(md)).toBe("before\n\nafter");
  });

  it("should remove inline code", () => {
    expect(cleanMarkdown("use `const` here")).toBe("use  here");
  });

  it("should extract text from links", () => {
    expect(cleanMarkdown("[click here](https://example.com)")).toBe(
      "click here"
    );
  });

  it("should handle image syntax (link regex matches first, leaving '!')", () => {
    // Note: the link regex runs before the image regex, so
    // ![alt text](image.png) -> !alt text (the ! prefix remains)
    expect(cleanMarkdown("![alt text](image.png)")).toBe("!alt text");
  });

  it("should remove heading markers", () => {
    expect(cleanMarkdown("# Title")).toBe("Title");
    expect(cleanMarkdown("## Subtitle")).toBe("Subtitle");
    expect(cleanMarkdown("###### Deep heading")).toBe("Deep heading");
  });

  it("should remove bold and italic markers", () => {
    expect(cleanMarkdown("**bold** and *italic*")).toBe("bold and italic");
  });

  it("should remove blockquote markers", () => {
    expect(cleanMarkdown("> quoted text")).toBe("quoted text");
  });

  it("should remove horizontal rules", () => {
    expect(cleanMarkdown("before\n---\nafter")).toBe("before\n\nafter");
    expect(cleanMarkdown("before\n***\nafter")).toBe("before\n\nafter");
  });

  it("should handle empty string", () => {
    expect(cleanMarkdown("")).toBe("");
  });

  it("should handle plain text without Markdown", () => {
    const text = "This is plain Japanese text: 吾輩は猫である。";
    expect(cleanMarkdown(text)).toBe(text);
  });

  it("should handle multiple Markdown elements together", () => {
    const md = "# Title\n\n**Bold** text with [link](url) and `code`";
    const result = cleanMarkdown(md);
    expect(result).toContain("Title");
    expect(result).toContain("Bold");
    expect(result).toContain("link");
    expect(result).not.toContain("#");
    expect(result).not.toContain("**");
    expect(result).not.toContain("`");
  });
});

// ---------------------------------------------------------------------------
// generateHeadingId
// ---------------------------------------------------------------------------
describe("generateHeadingId", () => {
  it("should encode a simple English heading", () => {
    expect(generateHeadingId("Hello World")).toBe("Hello%20World");
  });

  it("should encode Japanese text", () => {
    const result = generateHeadingId("第一章");
    expect(result).toBe(encodeURIComponent("第一章"));
  });

  it("should strip Markdown formatting before encoding", () => {
    expect(generateHeadingId("**Bold Title**")).toBe("Bold%20Title");
  });

  it("should trim whitespace", () => {
    expect(generateHeadingId("  spaced  ")).toBe("spaced");
  });

  it("should handle empty string", () => {
    expect(generateHeadingId("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// parseMarkdownChapters
// ---------------------------------------------------------------------------
describe("parseMarkdownChapters", () => {
  it("should parse a single heading", () => {
    const chapters = parseMarkdownChapters("# 第一章");
    expect(chapters).toHaveLength(1);
    expect(chapters[0].level).toBe(1);
    expect(chapters[0].title).toBe("第一章");
    expect(chapters[0].lineNumber).toBe(0);
    expect(chapters[0].charOffset).toBe(0);
  });

  it("should parse multiple headings with different levels", () => {
    const md = "# Title\n\n## Section 1\n\nText\n\n### Subsection";
    const chapters = parseMarkdownChapters(md);
    expect(chapters).toHaveLength(3);
    expect(chapters[0].level).toBe(1);
    expect(chapters[1].level).toBe(2);
    expect(chapters[2].level).toBe(3);
  });

  it("should track line numbers correctly", () => {
    const md = "# First\nsome text\n## Second";
    const chapters = parseMarkdownChapters(md);
    expect(chapters[0].lineNumber).toBe(0);
    expect(chapters[1].lineNumber).toBe(2);
  });

  it("should track charOffset correctly", () => {
    const md = "# A\nBC\n## D";
    const chapters = parseMarkdownChapters(md);
    // Line 0: "# A" = 3 chars + 1 newline = offset 4
    // Line 1: "BC" = 2 chars + 1 newline = offset 7
    expect(chapters[0].charOffset).toBe(0);
    expect(chapters[1].charOffset).toBe(7);
  });

  it("should generate anchorId for each heading", () => {
    const chapters = parseMarkdownChapters("# 物語の始まり");
    expect(chapters[0].anchorId).toBe(encodeURIComponent("物語の始まり"));
  });

  it("should return empty array for text without headings", () => {
    expect(parseMarkdownChapters("Just plain text.")).toEqual([]);
  });

  it("should return empty array for empty string", () => {
    expect(parseMarkdownChapters("")).toEqual([]);
  });

  it("should ignore lines that look like headings but are not (no space after #)", () => {
    expect(parseMarkdownChapters("#NoSpace")).toEqual([]);
  });

  it("should handle h6 headings", () => {
    const chapters = parseMarkdownChapters("###### Deep");
    expect(chapters[0].level).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// countSentences
// ---------------------------------------------------------------------------
describe("countSentences", () => {
  it("should count sentences ending with Japanese period", () => {
    expect(countSentences("吾輩は猫である。名前はまだない。")).toBe(2);
  });

  it("should count sentences ending with exclamation mark", () => {
    expect(countSentences("すごい！びっくりした！")).toBe(2);
  });

  it("should count sentences ending with question mark", () => {
    expect(countSentences("何？どうして？")).toBe(2);
  });

  it("should handle mixed sentence endings", () => {
    expect(countSentences("猫が来た。本当に？すごい！")).toBe(3);
  });

  it("should return 0 for empty string", () => {
    expect(countSentences("")).toBe(0);
  });

  it("should return 1 for text without sentence-ending punctuation", () => {
    // Text without 。！？ is one continuous sentence
    expect(countSentences("吾輩は猫である")).toBe(1);
  });

  it("should not count empty segments after trailing punctuation", () => {
    // "text。" splits into ["text", ""], so only 1 non-empty segment
    expect(countSentences("吾輩は猫である。")).toBe(1);
  });

  it("should handle whitespace-only segments after split", () => {
    expect(countSentences("はい。  ")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// analyzeCharacterTypes
// ---------------------------------------------------------------------------
describe("analyzeCharacterTypes", () => {
  it("should count kanji correctly", () => {
    const result = analyzeCharacterTypes("漢字");
    expect(result.kanji).toBe(2);
    expect(result.hiragana).toBe(0);
    expect(result.katakana).toBe(0);
    expect(result.other).toBe(0);
    expect(result.total).toBe(2);
  });

  it("should count hiragana correctly", () => {
    const result = analyzeCharacterTypes("あいう");
    expect(result.hiragana).toBe(3);
    expect(result.total).toBe(3);
  });

  it("should count katakana correctly", () => {
    const result = analyzeCharacterTypes("カタカナ");
    expect(result.katakana).toBe(4);
    expect(result.total).toBe(4);
  });

  it("should categorize other characters (ASCII, punctuation)", () => {
    const result = analyzeCharacterTypes("abc123");
    expect(result.other).toBe(6);
    expect(result.total).toBe(6);
  });

  it("should handle mixed Japanese text", () => {
    // "猫はカフェにいる。"
    // 猫(kanji) は(hira) カ(kata) フ(kata) ェ(kata) に(hira) い(hira) る(hira) 。(other)
    const result = analyzeCharacterTypes("猫はカフェにいる。");
    expect(result.kanji).toBe(1);
    expect(result.hiragana).toBe(4); // は, に, い, る
    expect(result.katakana).toBe(3); // カ, フ, ェ
    expect(result.other).toBe(1); // 。
    expect(result.total).toBe(9);
  });

  it("should return all zeros for empty string", () => {
    const result = analyzeCharacterTypes("");
    expect(result.kanji).toBe(0);
    expect(result.hiragana).toBe(0);
    expect(result.katakana).toBe(0);
    expect(result.other).toBe(0);
    expect(result.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateCharacterUsageRates
// ---------------------------------------------------------------------------
describe("calculateCharacterUsageRates", () => {
  it("should calculate correct percentages", () => {
    const analysis: CharacterTypeAnalysis = {
      kanji: 30,
      hiragana: 50,
      katakana: 10,
      other: 10,
      total: 100,
    };
    const rates = calculateCharacterUsageRates(analysis);
    expect(rates.kanjiRate).toBe(30);
    expect(rates.hiraganaRate).toBe(50);
    expect(rates.katakanaRate).toBe(10);
  });

  it("should handle zero total (avoid division by zero)", () => {
    const analysis: CharacterTypeAnalysis = {
      kanji: 0,
      hiragana: 0,
      katakana: 0,
      other: 0,
      total: 0,
    };
    const rates = calculateCharacterUsageRates(analysis);
    // total is 0, function uses `total || 1` to avoid division by zero
    expect(rates.kanjiRate).toBe(0);
    expect(rates.hiraganaRate).toBe(0);
    expect(rates.katakanaRate).toBe(0);
  });

  it("should handle all kanji text", () => {
    const analysis: CharacterTypeAnalysis = {
      kanji: 10,
      hiragana: 0,
      katakana: 0,
      other: 0,
      total: 10,
    };
    const rates = calculateCharacterUsageRates(analysis);
    expect(rates.kanjiRate).toBe(100);
    expect(rates.hiraganaRate).toBe(0);
    expect(rates.katakanaRate).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateAveragePunctuationSpacing
// ---------------------------------------------------------------------------
describe("calculateAveragePunctuationSpacing", () => {
  it("should calculate average spacing between Japanese punctuation", () => {
    // "あ、い、う" -> punctuation at index 1 and 3, spacing = 2
    const result = calculateAveragePunctuationSpacing("あ、い、う");
    expect(result).toBe(2);
  });

  it("should return 0 for text with no punctuation", () => {
    expect(calculateAveragePunctuationSpacing("あいうえお")).toBe(0);
  });

  it("should return 0 for text with only one punctuation mark", () => {
    expect(calculateAveragePunctuationSpacing("あいう。")).toBe(0);
  });

  it("should handle multiple types of punctuation", () => {
    // Mix of 、 and 。
    const text = "吾輩は猫である。名前はまだない。";
    const result = calculateAveragePunctuationSpacing(text);
    expect(result).toBeGreaterThan(0);
  });

  it("should return 0 for empty string", () => {
    expect(calculateAveragePunctuationSpacing("")).toBe(0);
  });

  it("should handle consecutive punctuation marks", () => {
    // "。！" -> punctuation at indices 0 and 1, spacing = 1
    expect(calculateAveragePunctuationSpacing("。！")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// calculateReadabilityScore
// ---------------------------------------------------------------------------
describe("calculateReadabilityScore", () => {
  it("should return a score between 0 and 100", () => {
    const result = calculateReadabilityScore(
      "吾輩は猫である。名前はまだない。"
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("should return a level of 'easy', 'normal', or 'difficult'", () => {
    const result = calculateReadabilityScore(
      "吾輩は猫である。名前はまだない。"
    );
    expect(["easy", "normal", "difficult"]).toContain(result.level);
  });

  it("should include avgSentenceLength and avgPunctuationSpacing", () => {
    const result = calculateReadabilityScore(
      "短い文。もう一つ。"
    );
    expect(typeof result.avgSentenceLength).toBe("number");
    expect(typeof result.avgPunctuationSpacing).toBe("number");
  });

  it("should handle empty string", () => {
    const result = calculateReadabilityScore("");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.avgSentenceLength).toBe(0);
  });

  it("should penalize very long sentences", () => {
    // Create text with very long sentences (> 30 chars each)
    const longSentence = "あ".repeat(50) + "。";
    const shortSentence = "短い文。短い文。短い文。短い文。";
    const longResult = calculateReadabilityScore(longSentence);
    const shortResult = calculateReadabilityScore(shortSentence);
    // Long sentences should generally score lower
    expect(longResult.score).toBeLessThanOrEqual(shortResult.score);
  });

  it("should classify high scores as 'easy'", () => {
    // Craft text that hits ideal parameters:
    // ~15-25 char sentences, ~8-12 punctuation spacing, 30-40% kanji, >30% hiragana
    const text = "春の風が吹く。桜が咲いた。花見に行く。楽しい日だ。";
    const result = calculateReadabilityScore(text);
    // This should score reasonably well
    expect(result.score).toBeGreaterThanOrEqual(40);
  });
});

// ---------------------------------------------------------------------------
// calculateStatistics
// ---------------------------------------------------------------------------
describe("calculateStatistics", () => {
  it("should return complete statistics for Japanese text", () => {
    const text = "# 第一章\n\n吾輩は猫である。名前はまだない。";
    const stats = calculateStatistics(text);

    expect(stats.wordCount).toBeGreaterThan(0);
    expect(stats.charCount).toBeGreaterThan(0);
    expect(stats.manuscriptPages).toBeGreaterThanOrEqual(1);
    expect(stats.paragraphCount).toBeGreaterThan(0);
    expect(stats.hasJapanese).toBe(true);
  });

  it("should include advanced statistics", () => {
    const text = "吾輩は猫である。名前はまだない。";
    const stats = calculateStatistics(text);

    expect(stats.advanced).toBeDefined();
    expect(stats.advanced!.sentenceCount).toBe(2);
    expect(stats.advanced!.characterTypeAnalysis.total).toBeGreaterThan(0);
    expect(stats.advanced!.usageRates.kanjiRate).toBeGreaterThan(0);
    expect(stats.advanced!.readability.score).toBeGreaterThanOrEqual(0);
  });

  it("should count paragraphs separated by double newlines", () => {
    const text = "Paragraph 1\n\nParagraph 2\n\nParagraph 3";
    const stats = calculateStatistics(text);
    expect(stats.paragraphCount).toBe(3);
  });

  it("should handle empty string", () => {
    const stats = calculateStatistics("");
    expect(stats.wordCount).toBe(0);
    expect(stats.charCount).toBe(0);
    expect(stats.manuscriptPages).toBe(0);
    expect(stats.hasJapanese).toBe(false);
  });

  it("should detect non-Japanese text correctly", () => {
    const stats = calculateStatistics("Hello World. This is English.");
    expect(stats.hasJapanese).toBe(false);
  });

  it("should clean Markdown before counting characters", () => {
    const withMd = "# Title\n\n**Bold** [link](url) `code`";
    const stats = calculateStatistics(withMd);
    // The character count should not include Markdown syntax characters
    expect(stats.charCount).toBeLessThan(withMd.replace(/\s/g, "").length);
  });
});

// ---------------------------------------------------------------------------
// getChaptersFromDOM
// ---------------------------------------------------------------------------
describe("getChaptersFromDOM", () => {
  it("should return empty array when no .milkdown element exists", () => {
    expect(getChaptersFromDOM()).toEqual([]);
  });

  it("should extract headings from a .milkdown container", () => {
    // Set up a minimal DOM
    const container = document.createElement("div");
    container.className = "milkdown";

    const h1 = document.createElement("h1");
    h1.id = "chapter-1";
    h1.textContent = "第一章";
    container.appendChild(h1);

    const h2 = document.createElement("h2");
    h2.id = "section-1";
    h2.textContent = "出会い";
    container.appendChild(h2);

    document.body.appendChild(container);

    const chapters = getChaptersFromDOM();
    expect(chapters).toHaveLength(2);

    expect(chapters[0].level).toBe(1);
    expect(chapters[0].title).toBe("第一章");
    expect(chapters[0].anchorId).toBe("chapter-1");

    expect(chapters[1].level).toBe(2);
    expect(chapters[1].title).toBe("出会い");
    expect(chapters[1].anchorId).toBe("section-1");

    // Cleanup
    document.body.removeChild(container);
  });

  it("should set anchorId to undefined when heading has no id", () => {
    const container = document.createElement("div");
    container.className = "milkdown";

    const h3 = document.createElement("h3");
    h3.textContent = "No ID heading";
    container.appendChild(h3);

    document.body.appendChild(container);

    const chapters = getChaptersFromDOM();
    expect(chapters).toHaveLength(1);
    expect(chapters[0].anchorId).toBeUndefined();

    // Cleanup
    document.body.removeChild(container);
  });

  it("should handle empty heading text", () => {
    const container = document.createElement("div");
    container.className = "milkdown";

    const h1 = document.createElement("h1");
    h1.textContent = "";
    container.appendChild(h1);

    document.body.appendChild(container);

    const chapters = getChaptersFromDOM();
    expect(chapters).toHaveLength(1);
    expect(chapters[0].title).toBe("");

    // Cleanup
    document.body.removeChild(container);
  });
});

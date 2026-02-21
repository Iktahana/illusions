/**
 * Counter word (助数詞) mismatch dictionary
 * Maps noun categories to their correct counters and known incorrect pairings.
 */

export interface CounterMismatch {
  /** The incorrect counter */
  readonly counter: string;
  /** Nouns or noun categories this counter is wrong for */
  readonly invalidNouns: readonly string[];
  /** The correct counter to suggest */
  readonly suggestion: string;
  /** Description for the error message */
  readonly descriptionJa: string;
}

/**
 * Conservative set of clearly incorrect counter-noun combinations.
 * Only includes cases where the mismatch is unambiguous.
 */
export const COUNTER_MISMATCHES: readonly CounterMismatch[] = [
  // 人 (people counter) used for animals
  {
    counter: "人",
    invalidNouns: [
      "犬", "猫", "鳥", "魚", "馬", "牛", "豚", "羊",
      "鶏", "虫", "蛇", "兎", "鼠", "熊", "鹿", "猿", "象",
    ],
    suggestion: "匹",
    descriptionJa: "動物には「匹」または「頭」を使います",
  },
  // 匹 (small animal counter) used for people
  {
    counter: "匹",
    invalidNouns: [
      "人", "子供", "大人", "男", "女", "学生",
      "先生", "社員", "客", "患者",
    ],
    suggestion: "人",
    descriptionJa: "人には「人」を使います",
  },
  // 本 (long thin objects) used for flat objects
  {
    counter: "本",
    invalidNouns: [
      "紙", "皿", "切手", "写真", "葉", "布",
      "板", "シート", "カード", "チケット",
    ],
    suggestion: "枚",
    descriptionJa: "薄く平たいものには「枚」を使います",
  },
  // 枚 (flat objects) used for long thin objects
  {
    counter: "枚",
    invalidNouns: [
      "鉛筆", "ペン", "傘", "木", "棒", "瓶",
      "ビール", "ワイン", "映画", "電話",
    ],
    suggestion: "本",
    descriptionJa: "細長いものには「本」を使います",
  },
  // 台 (machines) used for people
  {
    counter: "台",
    invalidNouns: ["人", "子供", "大人", "男", "女", "学生"],
    suggestion: "人",
    descriptionJa: "人には「人」を使います",
  },
  // 冊 (books) used for paper sheets
  {
    counter: "冊",
    invalidNouns: ["紙", "レポート", "手紙", "書類"],
    suggestion: "枚",
    descriptionJa: "紙類には「枚」を使います（綴じたものには「冊」）",
  },
  // 頭 (large animals) used for small animals
  {
    counter: "頭",
    invalidNouns: [
      "犬", "猫", "鳥", "魚", "虫", "蛇",
      "兎", "鼠", "蟻", "蜂",
    ],
    suggestion: "匹",
    descriptionJa: "小動物には「匹」を使います",
  },
];

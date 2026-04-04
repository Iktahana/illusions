# Readability Scoring — Architecture Design

**対象機能**: 日本語可読性評価スコア（読みやすさ）  
**ステータス**: 実装中  
**ブランチ**: `feature/readability-enhanced-scoring`

---

## 背景と動機

現状の `calculateReadabilityScore()` は4指標（平均文長・句読点間隔・漢字率・ひらがな率）のみで判定しており、
「明らかに難しい文章（専門語・名詞連接・受け身構文が多い）でも短文であれば高得点」になる問題がある。

---

## 問題点（優先度順）

### Critical（バグ）

| # | 問題 | 箇所 |
|---|------|------|
| 1 | **生Markdownを渡している** — `#`・`**`・`[]()` が漢字率等に混入 | `use-text-statistics.ts:44` |
| 2 | **UI閾値とコード閾値のズレ** — コード: 70/40、UIツールチップ: 80/50 | `StatsPanel.tsx:217` |

### High（設計欠陥）

| # | 問題 |
|---|------|
| 3 | 平均文長だけで分布の外れ値（超長文）を見逃す |
| 4 | 漢字連続列（名詞連接の表層代理指標）を見ていない |
| 5 | カタカナ語密度を専門語指標として活用していない |
| 6 | 括弧・挿入句の複雑さ、接続詞の多さ、二重否定を無視 |

---

## 設計方針

### 2層構造

```
Phase 1: 表層分析（同期・常時計算）
  extractVisibleText() で前処理済みテキストを使用
  文長分布・文字種・括弧・漢字連続・カタカナ密度

Phase 2: 形態素分析（非同期・INlpClient 経由）
  接続詞密度・名詞連接・受け身/使役・固有名詞密度
  Phase 1 の結果を上書きして精度を上げる
```

### 4サブスコア → 加重合成

```
総合スコア = sentenceLoad    × 0.30
           + vocabulary      × 0.30
           + syntaxComplexity × 0.25
           + paragraphDensity × 0.15
```

**難易度閾値（UI・コード統一）**:
- ≥ 75: `easy`（やさしい）
- 50〜74: `normal`（普通）
- < 50: `difficult`（難しい）

---

## サブスコア仕様

### ① 文の負荷 `sentenceLoad`（起点100点、純減点方式）

| 指標 | 測定 | 減点 |
|------|------|------|
| P90文長 | 文長昇順ソートの90パーセンタイル | >80字: -15、>60字: -8、>45字: -5 |
| 最大文長 | max(文長配列) | >100字: -10 |
| 平均文長 | totalChars / sentenceCount | >45字: -20、>35字: -12、>25字: -5 |
| 長文比率 | (>50字の文数) / 全文数 | >50%: -20、>30%: -12、>20%: -5 |
| 読点なし長文率 | (30字超かつ読点0の文) / 全文数 | >30%: -15、>15%: -8 |
| 読点過多率 | (読点4個以上の文) / 全文数 | >20%: -10、>10%: -5 |
| 括弧密度 | 括弧開き記号数 / 文数 | >0.8: -15、>0.5: -8 |
| 入れ子括弧 | ネスト深さ ≥ 2 | -10 |
| 加点 | 平均15〜25字かつP90≤40字 | +5 |

### ② 語彙の難しさ `vocabulary`（起点100点）

| 指標 | 測定 | 減点 |
|------|------|------|
| 漢字率 | kanji / totalChars | >50%: -18、>35%: -8、<15%: -5 |
| カタカナ率 | katakana / totalChars | >25%: -12、>15%: -5 |
| 漢字連続列密度 | ≥4文字の漢字連続列 / 100字 | >1件: -8 |
| 長漢字連続列 | ≥6文字の漢字連続列の数 | 1件につき-3、max -12 |
| ★名詞連接（kuromoji） | 連続名詞token≥3の列の数 | 1件につき-2、max -10 |
| ★固有名詞密度（kuromoji） | 固有名詞token / 全token | >25%: -8 |
| ★TTR（kuromoji） | unique_lemma / total_content_words | <0.3: -8、>0.85: -5 |
| 加点 | 漢字率20〜30%かつカタカナ率<12% | +5 |

### ③ 構文の複雑さ `syntaxComplexity`（起点100点）

NLPなし時の初期値: **75**（固定）

| 指標 | 測定 | 減点 |
|------|------|------|
| 括弧ネスト最大深さ | 開き括弧の最大ネスト | ≥3: -15、≥2: -5 |
| 長い括弧内容 | 20字超の括弧内テキスト数 | 1件につき-3、max -12 |
| 接続詞率 | 接続詞で始まる文 / 全文数 | >40%: -15、>25%: -8 |
| 二重否定 | パターンマッチ数 | 1件につき-5、max -15 |
| 句読点間隔 | 平均句読点間隔（既存） | >20字: -15、>15字: -8 |
| ★受け身構文（kuromoji） | れる/られる動詞 / 全動詞 | >50%: -15、>30%: -8 |
| ★使役構文（kuromoji） | せる/させる動詞 / 全動詞 | >15%: -5 |

### ④ 段落密度 `paragraphDensity`（起点100点）

| 指標 | 測定 | 減点 |
|------|------|------|
| 平均段落長 | totalChars / paragraphCount | >300字: -12、>200字: -5 |
| 長段落比率 | (>300字段落) / 全段落 | >30%: -8 |
| 段落長の標準偏差 | √(分散) | >150: -5（一部が突出して長い） |
| 加点 | 平均段落長80〜180字 | +5 |

---

## モジュール構成

```
lib/utils/
  readability-types.ts     新規: 型定義（EnhancedReadabilityAnalysis 他）
  readability.ts           新規: analyzeReadability(), enrichWithMorphology()
  index.ts                 変更: calculateReadabilityScore() を薄いラッパーに

lib/editor-page/
  use-text-statistics.ts   変更: extractVisibleText() 経由で渡す（バグ修正）

components/inspector/
  StatsPanel.tsx           変更: 閾値ツールチップ修正、サブスコアUI追加（任意）
```

---

## 型定義

```typescript
// lib/utils/readability-types.ts

export interface ReadabilitySubScores {
  sentenceLoad: number;        // 文の負荷 (0-100)
  vocabulary: number;          // 語彙の難しさ (0-100)
  syntaxComplexity: number;    // 構文の複雑さ (0-100)
  paragraphDensity: number;    // 段落密度 (0-100)
}

export interface EnhancedReadabilityAnalysis {
  score: number;                             // 総合スコア (0-100)
  level: "easy" | "normal" | "difficult";
  subScores: ReadabilitySubScores;
  /** 後方互換フィールド */
  avgSentenceLength: number;
  avgPunctuationSpacing: number;
  /** kuromoji分析が含まれているか */
  hasMorphologicalAnalysis: boolean;
}
```

---

## 導入手順（段階的）

### Phase 0（即時・1コミット）
1. `use-text-statistics.ts:44` で `extractVisibleText(content)` を通してから渡す
2. `StatsPanel.tsx` のツールチップ閾値を 75/50 に統一

### Phase 1（本PR）
1. `lib/utils/readability-types.ts` を新設
2. `lib/utils/readability.ts` に `analyzeReadability()` を実装（表層のみ）
3. `lib/utils/index.ts` の `calculateReadabilityScore()` を `analyzeReadability()` のラッパーに
4. `ReadabilityAnalysis` → `EnhancedReadabilityAnalysis` の後方互換を維持

### Phase 2（次PR）
1. `enrichReadabilityWithMorphology()` を実装
2. `use-text-statistics.ts` に `nlpClient` を受け取り非同期更新するロジックを追加
3. UIに `hasMorphologicalAnalysis` フラグで「分析中/完了」を表示

---

## テスト用文章例

### 現行で高得点・新ロジックで下がるべき

1. **専門語短文**
   `ハイパーインフレーション抑制のため、中央銀行は量的緩和政策の段階的縮小（テーパリング）を実施した。`
   → カタカナ率高・漢語連接→語彙サブスコア減

2. **括弧の入れ子**
   `彼（当時32歳、東京（大田区）在住、元エンジニア（ソフトウェア開発部門））は昨年退職した。`
   → ネスト深さ3→構文サブスコア-15

3. **接続詞の連鎖**
   `しかし状況は変わった。ただし完全にではない。それにもかかわらず前進は続いた。なぜなら目標があったからだ。したがって撤退はなかった。`
   → 接続詞率100%→構文サブスコア-15

4. **二重否定の連続**
   `その判断が誤りでないとも言えないわけではないが、正しいとも言い切れないことはないとも言えない状況だ。`
   → 二重否定3個→-15点

5. **霞ヶ関文体の長漢字連接**
   `本事業実施主体選定基準策定委員会規程改正案審議結果についての報告書提出期限延長申請書記載要領説明会実施要領。`
   → 漢字連続列→語彙サブスコア壊滅

### 難しいテーマでも平明で高評価のまま

1. `電子は観測するまで、どこにあるかが決まっていない。波のように広がっているが、測った瞬間に一点に決まる。これを「重ね合わせ」と呼ぶ。`
2. `「正しさ」とは何かを問われると、答えに詰まる人は多い。ある文化では正しいことが、別の文化では間違いとされる。だからこそ、倫理は永遠の問いであり続ける。`
3. `血圧が高い状態が続くと、血管に負担がかかる。心臓も余分な力を使い続けることになる。気づかないまま悪化することが多いため、定期的な測定が大切だ。`
4. `少子化の原因は一つではない。経済的な不安、働き方の問題、住環境の変化。どれかを解決すれば終わりというものではなく、複合的な対策が必要だ。`
5. `1868年、明治政府が成立した。江戸幕府が約260年間続いた後のことだ。新政府はすぐに近代化を進め、西洋の技術や制度を積極的に取り入れた。`

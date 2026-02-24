/**
 * Character extraction prompt templates.
 *
 * Prompt content is inlined as TypeScript strings to avoid webpack
 * asset/source .md imports that break the Next.js RSC bundler.
 *
 * Placeholders resolved at runtime:
 *   EXTRACTOR_PROMPT: {{TEXT_SEGMENT}}
 *   MERGER_PROMPT: {{JSON_LIST_FROM_STAGE_1}}
 */

const extractorMd = `/no_think
# Role
あなたは優れた文学解析AIです。
渡された小説のテキスト断片（セグメント）から、登場人物（キャラクター）を抽出し、JSON形式で出力してください。

# Rules
1. **抽出基準**:
   - 名前がある人物、または物語上で重要な役割を果たす人物（「私」、「老人」など）を抽出してください。
   - 人物が一切登場しない、または風景描写のみの場合は、空のリスト \`[]\` を返してください。
   - 作者が明確に擬人化している物体（「歌う時計」など）や、象徴的な意象（「白い悪魔」としての雪など）は抽出対象に含めてください。

2. **出力フォーマット**:
   - 必ず有効なJSONのみを出力してください。
   - Markdownのコードブロック（\\\`\\\`\\\`json）や挨拶文は不要です。
   - \`aliases\` には、その段落内で呼ばれている別の呼び名（愛称、役職、二人称など）をすべて配列で含めてください。

# Example (Few-shot)
User:
「おい、太宰、また飲んでいるのか」
織田作は呆れたように笑いながら、銀座のバーの扉を開けた。
カウンターの奥では、先生がグラスを揺らしている。「やあ、織田作君」

A:
{
  "characters": [
    {
      "name": "織田作",
      "aliases": ["織田作君"],
      "description": "銀座のバーに入ってきた人物。呆れたように笑っている。"
    },
    {
      "name": "太宰",
      "aliases": ["先生"],
      "description": "カウンターの奥でグラスを揺らしている人物。"
    }
  ]
}

# Task
以下のテキストからキャラクターを抽出してください：

{{TEXT_SEGMENT}}`;

const mergerMd = `/no_think
# Role
あなたはプロの編集者です。
小説の複数の段落から抽出された「キャラクターリストの断片」を統合し、重複を整理して「最終的な登場人物リスト」を作成してください。

# Rules
1. **名寄せ（Identity Resolution）**:
   - 名前が少し異なっていても、同一人物と判断できる場合は1つに統合してください。
   - 例: 「太宰」「太宰治」「先生」 -> 正式名称「太宰治」として統合。

2. **情報の統合**:
   - \`aliases\` (別名): すべてのリストから別名を集め、重複を削除して配列にまとめてください。
   - \`description\` (特徴): 各断片にある特徴を要約し、その人物の全体像がわかるように簡潔にまとめてください。

3. **ノイズ除去**:
   - 明らかに誤って抽出された単語（動詞や挨拶など）が含まれている場合は削除してください。

4. **出力**:
   - 解説は不要です。結果のJSONのみを出力してください。

# Input Data
以下は、各段落から抽出された生のデータリストです：

{{JSON_LIST_FROM_STAGE_1}}

# Output Format
{
  "characters": [
    {
      "name": "最も正式な名称",
      "aliases": ["別名1", "別名2", ...],
      "description": "統合された要約説明"
    }
  ]
}`;

export const EXTRACTOR_PROMPT: string = extractorMd;
export const MERGER_PROMPT: string = mergerMd;

"use client";

import InfoTooltip from "./InfoTooltip";

interface StatsPanelProps {
  charCount: number;
  selectedCharCount: number;
  paragraphCount: number;
  manuscriptPages: number;
  sentenceCount?: number;
  charTypeAnalysis?: {
    kanji: number;
    hiragana: number;
    katakana: number;
    other: number;
    total: number;
  };
  charUsageRates?: {
    kanjiRate: number;
    hiraganaRate: number;
    katakanaRate: number;
  };
  readabilityAnalysis?: {
    score: number;
    level: string;
    avgSentenceLength: number;
    avgPunctuationSpacing: number;
  };
}

/** Statistics panel displaying character counts, readability, and reading time */
export default function StatsPanel({
  charCount,
  selectedCharCount,
  paragraphCount,
  manuscriptPages,
  sentenceCount = 0,
  charTypeAnalysis,
  charUsageRates,
  readabilityAnalysis,
}: StatsPanelProps) {
  const isSelection = selectedCharCount > 0;
  const activeCharCount = isSelection ? selectedCharCount : charCount;

  // Approximate punctuation estimation
  const estimatedPunctuation = Math.floor(activeCharCount * 0.12);
  const pureTextCount = activeCharCount - estimatedPunctuation;
  const punctuationRatio = activeCharCount > 0 ? (estimatedPunctuation / activeCharCount * 100).toFixed(1) : '0.0';

  // Style classification
  let styleHint = '';
  const ratio = parseFloat(punctuationRatio);
  if (ratio > 15) {
    styleHint = '会話文が中心';
  } else if (ratio < 8) {
    styleHint = '地の文が中心';
  } else {
    styleHint = 'バランス型';
  }

  // Paragraph analysis
  const avgParagraphLength = paragraphCount > 0 ? Math.floor(activeCharCount / paragraphCount) : 0;

  let paragraphWarning = '';
  if (avgParagraphLength >= 300) {
    paragraphWarning =
      '一段落に含まれる情報量がやや多いようです。内容のまとまりごとに区切ると、読みやすさが向上するかもしれません。';
  } else if (avgParagraphLength >= 200) {
    paragraphWarning =
      '読み応えのある段落構成です。公的文書や解説文としては安定していますが、スマホでは少し長く感じられる場合があります。';
  } else if (avgParagraphLength >= 120) {
    paragraphWarning =
      '段落の長さは標準的で、エッセイや一般的な文章に適した構成です。落ち着いて読み進められます。';
  } else if (avgParagraphLength >= 80) {
    paragraphWarning =
      '小説向きの自然な段落長です。文章のリズムと情報量のバランスが保たれています。';
  } else if (avgParagraphLength > 0) {
    paragraphWarning =
      '段落がコンパクトで、テンポよく読めます。会話やスマホでの読書に向いた構成です。';
  }

  // Reading time calculation
  const calculateReadTime = (charsPerMinute: number): string => {
    if (activeCharCount === 0) return '0秒';
    const minutes = Math.floor(activeCharCount / charsPerMinute);
    const seconds = Math.round((activeCharCount % charsPerMinute) / charsPerMinute * 60);

    if (minutes === 0) {
      return `${seconds}秒`;
    } else if (seconds === 0) {
      return `${minutes}分`;
    } else {
      return `${minutes}分${seconds}秒`;
    }
  };

  const fastReadTime = calculateReadTime(900);
  const normalReadTime = calculateReadTime(500);
  const deepReadTime = calculateReadTime(250);

  const getReadabilityLevelLabel = (level?: string): string => {
    switch (level) {
      case 'easy':
        return 'やさしい';
      case 'normal':
        return '標準';
      case 'difficult':
        return '難しい';
      default:
        return '未分析';
    }
  };

  return (
    <div className="space-y-3 stats-panel">
      {/* 原稿用紙枚数（全体のみ表示、トップに配置） */}
      {!isSelection && (
        <div className="bg-background-secondary rounded-lg p-3 border border-border flex items-center justify-between">
          <div>
            <p className="text-xs text-foreground-tertiary font-medium mb-1 flex items-center">
              <InfoTooltip content="400字詰め原稿用紙に換算した枚数">
                原稿用紙
              </InfoTooltip>
            </p>
            <p className="text-xs text-foreground-tertiary">400字詰原稿用紙</p>
          </div>
          <span className="text-sm font-bold text-foreground">{manuscriptPages}枚</span>
        </div>
      )}

      {/* 見出し: 分析対象を動的に表示 */}
      <div className="flex items-center justify-between">
        <h3 className="stats-header">
          {isSelection ? '選択範囲の分析' : '全体の統計'}
        </h3>
        {isSelection && (
          <span className="text-xs px-2 py-1 rounded-full bg-accent/20 text-accent font-medium">
            選択中
          </span>
        )}
      </div>

      {/* 可読性分析 (Readability) */}
      {readabilityAnalysis && !isSelection && (
        <div className="bg-background-secondary rounded-lg p-4 border border-border">
          <h4 className="text-xs font-medium text-foreground-tertiary uppercase tracking-wide mb-3">
             読みやすさ
          </h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 min-w-0">
                <InfoTooltip
                  content="文章の読みやすさを100点満点で評価。文の長さや句読点の配置から算出"
                  className="text-sm text-foreground-secondary whitespace-nowrap"
                >
                  スコア
                </InfoTooltip>
              </div>
              <div className="flex items-baseline gap-1 flex-shrink-0">
                <span className="text-xl font-bold text-foreground">{readabilityAnalysis.score}</span>
                <span className="text-xs text-foreground-tertiary">/100</span>
              </div>
            </div>
             <div className="w-full h-2 bg-background rounded-full overflow-hidden border border-border-secondary">
               <div
                 className="h-full transition-all"
                 style={{
                   width: `${readabilityAnalysis.score}%`,
                   backgroundColor: `var(--progress-readability)`,
                 }}
               />
             </div>
            <div className="flex justify-between items-baseline gap-2">
              <div className="flex items-center gap-1 min-w-0">
                <InfoTooltip
                  content={`80点以上：やさしい\n50-79点：普通\n50点未満：難しい`}
                  className="text-sm text-foreground-secondary whitespace-nowrap"
                >
                  難易度
                </InfoTooltip>
              </div>
              <span className="text-sm font-semibold text-foreground flex-shrink-0">
                {getReadabilityLevelLabel(readabilityAnalysis.level)}
              </span>
            </div>
            <div className="pt-1 border-t border-border space-y-1">
              <div className="flex justify-between items-baseline text-xs gap-2">
                <div className="flex items-center gap-1 min-w-0">
                  <InfoTooltip
                    content="1文あたりの平均文字数。40字以上は長め、20字以下は短めの文章"
                    className="text-foreground-tertiary whitespace-nowrap"
                  >
                    一文平均
                  </InfoTooltip>
                </div>
                <span className="text-foreground flex-shrink-0 text-sm">{readabilityAnalysis.avgSentenceLength}字/文</span>
              </div>
              <div className="flex justify-between items-baseline text-xs gap-2">
                <div className="flex items-center gap-1 min-w-0">
                  <InfoTooltip
                    content="句読点（、。）の間の平均文字数。15字以下が読みやすい"
                    className="text-foreground-tertiary whitespace-nowrap"
                  >
                    句読点間隔
                  </InfoTooltip>
                </div>
                <span className="text-foreground flex-shrink-0 text-sm">{readabilityAnalysis.avgPunctuationSpacing}字</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 文字数内訳 */}
      <div className="bg-background-secondary rounded-lg p-4 border border-border">
        <h4 className="text-xs font-medium text-foreground-tertiary uppercase tracking-wide mb-3">
           文字数
        </h4>
        <div className="space-y-1.5">
          <div className="flex justify-between items-baseline gap-2">
            <div className="flex items-center gap-1 min-w-0">
              <InfoTooltip
                content="空白・改行を含むすべての文字数（原稿用紙換算の基準）"
                className="text-sm text-foreground-secondary whitespace-nowrap"
              >
                総字数
              </InfoTooltip>
            </div>
            <span className="text-base font-semibold text-foreground flex-shrink-0">{activeCharCount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-baseline gap-2">
            <div className="flex items-center gap-1 min-w-0">
              <InfoTooltip
                content="文末の句点（。）で区切られる文の数"
                className="text-sm text-foreground-secondary whitespace-nowrap"
              >
                文数
              </InfoTooltip>
            </div>
            <span className="text-sm font-medium text-foreground flex-shrink-0">{sentenceCount}文</span>
          </div>
          {sentenceCount > 0 && (
            <div className="flex justify-between items-baseline gap-2">
              <div className="flex items-center gap-1 min-w-0">
                <InfoTooltip
                  content="1文あたりの平均文字数。短いほど読みやすい"
                  className="text-sm text-foreground-secondary whitespace-nowrap"
                >
                  一文平均
                </InfoTooltip>
              </div>
              <span className="text-sm font-medium text-foreground flex-shrink-0">
                {readabilityAnalysis ? `${readabilityAnalysis.avgSentenceLength}字/文` : '-'}
              </span>
            </div>
          )}
          <div className="flex justify-between items-baseline gap-2">
            <div className="flex items-center gap-1 min-w-0">
              <InfoTooltip
                content="句読点・記号を除いた本文のみの文字数"
                className="text-sm text-foreground-secondary whitespace-nowrap"
              >
                本文字数
              </InfoTooltip>
            </div>
            <span className="text-sm font-medium text-foreground flex-shrink-0">{pureTextCount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-baseline gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <InfoTooltip
                  content="記号・句読点の割合。15%超：会話文中心、8%未満：地の文中心"
                  className="text-sm text-foreground-secondary whitespace-nowrap"
                >
                  約物比率
                </InfoTooltip>
              </div>
              <div className="text-xs text-foreground-tertiary">({styleHint})</div>
            </div>
            <span className="text-sm font-medium text-foreground flex-shrink-0">
              {punctuationRatio}%
            </span>
          </div>
        </div>
      </div>

      {/* 文字種内訳 (Character Type Analysis) */}
      {charTypeAnalysis && !isSelection && (
        <div className="bg-background-secondary rounded-lg p-4 border border-border">
          <h4 className="text-xs font-medium text-foreground-tertiary uppercase tracking-wide mb-3">
             文字種別
          </h4>
          <div className="space-y-1.5">
            <div className="flex justify-between items-baseline gap-2">
              <div className="flex items-center gap-1 min-w-0">
                <InfoTooltip
                  content="漢字の使用数と割合。一般的に20-30%が読みやすい"
                  className="text-sm text-foreground-secondary whitespace-nowrap"
                >
                  漢字
                </InfoTooltip>
              </div>
              <span className="text-sm font-medium text-foreground flex-shrink-0">
                {charTypeAnalysis.kanji} 字 {charUsageRates ? `(${charUsageRates.kanjiRate.toFixed(1)}%)` : ''}
              </span>
            </div>
            <div className="flex justify-between items-baseline gap-2">
              <div className="flex items-center gap-1 min-w-0">
                <InfoTooltip
                  content="ひらがなの使用数と割合。通常50-70%程度"
                  className="text-sm text-foreground-secondary whitespace-nowrap"
                >
                  ひらがな
                </InfoTooltip>
              </div>
              <span className="text-sm font-medium text-foreground flex-shrink-0">
                {charTypeAnalysis.hiragana} 字 {charUsageRates ? `(${charUsageRates.hiraganaRate.toFixed(1)}%)` : ''}
              </span>
            </div>
            <div className="flex justify-between items-baseline gap-2">
              <div className="flex items-center gap-1 min-w-0">
                <InfoTooltip
                  content="カタカナの使用数と割合。外来語や擬音語に使用"
                  className="text-sm text-foreground-secondary whitespace-nowrap"
                >
                  カタカナ
                </InfoTooltip>
              </div>
              <span className="text-sm font-medium text-foreground flex-shrink-0">
                {charTypeAnalysis.katakana} 字 {charUsageRates ? `(${charUsageRates.katakanaRate.toFixed(1)}%)` : ''}
              </span>
            </div>
            {charTypeAnalysis.other > 0 && (
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-foreground-secondary">その他</span>
                <span className="text-sm font-medium text-foreground">{charTypeAnalysis.other}字</span>
              </div>
            )}
            {/* 文字種の分布バー */}
            <div className="pt-1 space-y-1">
              <div className="h-6 flex rounded-md overflow-hidden bg-background border border-border-secondary">
                {charTypeAnalysis.total > 0 && (
                  <>
                    {charTypeAnalysis.kanji > 0 && (
                      <div 
                        className="flex items-center justify-center text-white text-xs font-semibold"
                        style={{ 
                          width: `${(charTypeAnalysis.kanji / charTypeAnalysis.total) * 100}%`,
                          backgroundColor: `var(--progress-kanji)`
                        }}
                        title={`漢字: ${charTypeAnalysis.kanji}`}
                      />
                    )}
                    {charTypeAnalysis.hiragana > 0 && (
                      <div 
                        className="flex items-center justify-center text-white text-xs font-semibold"
                        style={{ 
                          width: `${(charTypeAnalysis.hiragana / charTypeAnalysis.total) * 100}%`,
                          backgroundColor: `var(--progress-hiragana)`
                        }}
                        title={`ひらがな: ${charTypeAnalysis.hiragana}`}
                      />
                    )}
                    {charTypeAnalysis.katakana > 0 && (
                      <div 
                        className="flex items-center justify-center text-white text-xs font-semibold"
                        style={{ 
                          width: `${(charTypeAnalysis.katakana / charTypeAnalysis.total) * 100}%`,
                          backgroundColor: `var(--progress-katakana)`
                        }}
                        title={`カタカナ: ${charTypeAnalysis.katakana}`}
                      />
                    )}
                    {charTypeAnalysis.other > 0 && (
                      <div 
                        className="flex items-center justify-center text-white text-xs font-semibold"
                        style={{ 
                          width: `${(charTypeAnalysis.other / charTypeAnalysis.total) * 100}%`,
                          backgroundColor: `var(--progress-other)`
                        }}
                        title={`その他: ${charTypeAnalysis.other}`}
                      />
                    )}
                  </>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: `var(--progress-kanji)` }} />
                  <span className="text-foreground-tertiary">漢字</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: `var(--progress-hiragana)` }} />
                  <span className="text-foreground-tertiary">ひらがな</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: `var(--progress-katakana)` }} />
                  <span className="text-foreground-tertiary">カタカナ</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: `var(--progress-other)` }} />
                  <span className="text-foreground-tertiary">その他</span>
                </div>
              </div>
           </div>
         </div>
       </div>
     )}

      {/* 段落構成 */}
      <div className="bg-background-secondary rounded-lg p-4 border border-border">
        <h4 className="text-xs font-medium text-foreground-tertiary uppercase tracking-wide mb-3">
           段落
        </h4>
        <div className="space-y-1.5">
          <div className="flex justify-between items-baseline gap-2">
            <div className="flex items-center gap-1 min-w-0">
              <InfoTooltip
                content="改行で区切られる段落の総数"
                className="text-sm text-foreground-secondary whitespace-nowrap"
              >
                段落数
              </InfoTooltip>
            </div>
            <span className="text-base font-semibold text-foreground flex-shrink-0">{paragraphCount}</span>
          </div>
          <div className="flex justify-between items-baseline gap-2">
            <div className="flex items-center gap-1 min-w-0">
              <InfoTooltip
                content="段落構成の傾向を見るための指標です。良し悪しを示すものではなく、文章設計を振り返るための参考値です。"
                className="text-sm text-foreground-secondary whitespace-nowrap"
              >
                一段落平均
              </InfoTooltip>
            </div>
            <span className="text-sm font-medium text-foreground flex-shrink-0">{avgParagraphLength}字/段</span>
          </div>
         {paragraphWarning && (
           <div className="mt-2">
             <div className="h-px bg-border" />
              <small className="mt-2 block text-[10px] text-foreground/50">
                補足: {paragraphWarning}
              </small>
           </div>
         )}
       </div>
     </div>

      {/* 読了時間（目安） */}
      <div className="bg-background-secondary rounded-lg p-4 border border-border">
        <h4 className="text-xs font-medium text-foreground-tertiary uppercase tracking-wide mb-3">
           読了時間
        </h4>
        <div className="space-y-1.5">
          <div className="flex justify-between items-baseline gap-2">
            <div className="flex items-center gap-1 min-w-0">
              <InfoTooltip
                content="分速900字で計算"
                className="text-sm text-foreground-secondary whitespace-nowrap"
              >
                速読時
              </InfoTooltip>
            </div>
            <span className="text-sm font-medium text-foreground flex-shrink-0">{fastReadTime}</span>
          </div>
          <div className="flex justify-between items-baseline gap-2">
            <div className="flex items-center gap-1 min-w-0">
              <InfoTooltip
                content="通常の読書速度（分速500字、日本語の平均的な速度）"
                className="text-sm text-foreground-secondary whitespace-nowrap"
              >
                通常時
              </InfoTooltip>
            </div>
            <span className="text-sm font-medium text-foreground flex-shrink-0">{normalReadTime}</span>
          </div>
          <div className="flex justify-between items-baseline gap-2">
            <div className="flex items-center gap-1 min-w-0">
              <InfoTooltip
                content="じっくり読む速度（分速250字で計算）"
                className="text-sm text-foreground-secondary whitespace-nowrap"
              >
                精読時
              </InfoTooltip>
            </div>
            <span className="text-sm font-medium text-foreground flex-shrink-0">{deepReadTime}</span>
          </div>
        </div>
      </div>



   </div>
 );
}

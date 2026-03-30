import type { LintRule } from "@/lib/linting/types";

// ---------------------------------------------------------------------------
// L1 Custom
// ---------------------------------------------------------------------------
import { PunctuationRule } from "@/lib/linting/rules/punctuation-rules";
import { NumberFormatRule } from "@/lib/linting/rules/number-format";
import { JoyoKanjiRule } from "@/lib/linting/rules/joyo-kanji";
import { EraYearValidatorRule } from "@/lib/linting/rules/era-year-validator";
import { ParticleNoRepetitionRule } from "@/lib/linting/rules/particle-no-repetition";
import { ConjugationErrorRule } from "@/lib/linting/rules/conjugation-errors";
import { RedundantExpressionRule } from "@/lib/linting/rules/redundant-expression";
import { VerboseExpressionRule } from "@/lib/linting/rules/verbose-expression";
import { SentenceEndingRepetitionRule } from "@/lib/linting/rules/sentence-ending-repetition";
import { CorrelativeExpressionRule } from "@/lib/linting/rules/correlative-expression";
import { NotationConsistencyRule } from "@/lib/linting/rules/notation-consistency";
import { SentenceLengthRule } from "@/lib/linting/rules/sentence-length";
import { DashFormatRule } from "@/lib/linting/rules/dash-format";
import { DialoguePunctuationRule } from "@/lib/linting/rules/dialogue-punctuation";
import { CommaFrequencyRule } from "@/lib/linting/rules/comma-frequency";

// ---------------------------------------------------------------------------
// L1 Standards-based
// ---------------------------------------------------------------------------
import { MixedWidthSpacingRule } from "@/lib/linting/rules/mixed-width-spacing-rule";
import { BracketSpacingRule } from "@/lib/linting/rules/bracket-spacing-rule";
import { KatakanaWidthRule } from "@/lib/linting/rules/katakana-width-rule";
import { KatakanaChouonRule } from "@/lib/linting/rules/katakana-chouon-rule";
import { JapanesePunctuationWidthRule } from "@/lib/linting/rules/japanese-punctuation-width-rule";
import { HeadingPeriodRule } from "@/lib/linting/rules/heading-period-rule";
import { AlphanumericHalfWidthRule } from "@/lib/linting/rules/alphanumeric-half-width-rule";
import { ListFormattingConsistencyRule } from "@/lib/linting/rules/list-formatting-consistency-rule";
import { NakaguroUsageRule } from "@/lib/linting/rules/nakaguro-usage-rule";
import { WaveDashUnificationRule } from "@/lib/linting/rules/wave-dash-unification-rule";
import { IterationMarkRule } from "@/lib/linting/rules/iteration-mark-rule";
import { BracketPeriodPlacementRule } from "@/lib/linting/rules/bracket-period-placement-rule";
import { LargeNumberCommaRule } from "@/lib/linting/rules/large-number-comma-rule";
import { CounterCharacterRule } from "@/lib/linting/rules/counter-character-rule";
import { VuKatakanaRule } from "@/lib/linting/rules/vu-katakana-rule";
import { GairaiKanaTableRule } from "@/lib/linting/rules/gairai-kana-table-rule";
import { JiZuKanaRule } from "@/lib/linting/rules/ji-zu-kana-rule";
import { HistoricalKanaDetection } from "@/lib/linting/rules/historical-kana-detection";
import { LongVowelKanaRule } from "@/lib/linting/rules/long-vowel-kana-rule";
import { VerbOkuriganaStrictRule } from "@/lib/linting/rules/verb-okurigana-strict-rule";
import { FixedOkuriganaNounRule } from "@/lib/linting/rules/fixed-okurigana-noun-rule";
import { FormalNounOpeningRule } from "@/lib/linting/rules/formal-noun-opening-rule";
import { AuxiliaryVerbOpeningRule } from "@/lib/linting/rules/auxiliary-verb-opening-rule";
import { ConjunctionOpeningRule } from "@/lib/linting/rules/conjunction-opening-rule";
import { ParticleSuffixModifierOpeningRule } from "@/lib/linting/rules/particle-suffix-modifier-opening-rule";
import { CompoundNounOkuriganaOmissionRule } from "@/lib/linting/rules/compound-noun-okurigana-omission-rule";
import { PrefixScriptMatchingRule } from "@/lib/linting/rules/prefix-script-matching-rule";
import { PronounKanjiRule } from "@/lib/linting/rules/pronoun-kanji-rule";
import { DoubleNegativeRule } from "@/lib/linting/rules/double-negative-rule";
import { ParticleKaraYoriRule } from "@/lib/linting/rules/particle-kara-yori-rule";
import { ConjunctiveGaOveruseRule } from "@/lib/linting/rules/conjunctive-ga-overuse-rule";
import { SuruBekiConjugationRule } from "@/lib/linting/rules/suru-beki-conjugation-rule";
import { ConjunctionHierarchyRule } from "@/lib/linting/rules/conjunction-hierarchy-rule";
import { ConsecutiveParticleRule } from "@/lib/linting/rules/consecutive-particle-rule";
import { TautologyRedundancyRule } from "@/lib/linting/rules/tautology-redundancy-rule";
import { OfficialStyleCopulaRule } from "@/lib/linting/rules/official-style-copula-rule";
import { LiteraryStyleExclusionRule } from "@/lib/linting/rules/literary-style-exclusion-rule";
import { ExcessiveHonorificRule } from "@/lib/linting/rules/excessive-honorific-rule";
import { ModifierLengthOrderRule } from "@/lib/linting/rules/modifier-length-order-rule";
import { KanjiVerbOneCharDo } from "@/lib/linting/rules/kanji-verb-one-char-do";

// ---------------------------------------------------------------------------
// L1 JSON-driven
// ---------------------------------------------------------------------------
import { createManuscriptL1Rules } from "@/lib/linting/rules/json-l1/manuscript-l1-rules";
import { createJtfL1Rules } from "@/lib/linting/rules/json-l1/jtf-l1-rules";
import { createGendaiKanazukaiL1Rules, createNihongoHyoukiL1Rules } from "@/lib/linting/rules/json-l1";

// ---------------------------------------------------------------------------
// L2 Morphological
// ---------------------------------------------------------------------------
import { DesuMasuConsistencyRule } from "@/lib/linting/rules/desu-masu-consistency";
import { ConjunctionOveruseRule } from "@/lib/linting/rules/conjunction-overuse";
import { WordRepetitionRule } from "@/lib/linting/rules/word-repetition";
import { TaigenDomeOveruseRule } from "@/lib/linting/rules/taigen-dome-overuse";
import { PassiveOveruseRule } from "@/lib/linting/rules/passive-overuse";
import { CounterWordMismatchRule } from "@/lib/linting/rules/counter-word-mismatch";
import { AdverbFormConsistencyRule } from "@/lib/linting/rules/adverb-form-consistency";

export function getAllRules(): LintRule[] {
  return [
    new PunctuationRule(),
    new NumberFormatRule(),
    new JoyoKanjiRule(),
    new EraYearValidatorRule(),
    new ParticleNoRepetitionRule(),
    new ConjugationErrorRule(),
    new RedundantExpressionRule(),
    new VerboseExpressionRule(),
    new SentenceEndingRepetitionRule(),
    new CorrelativeExpressionRule(),
    new NotationConsistencyRule(),
    new SentenceLengthRule(),
    new DashFormatRule(),
    new DialoguePunctuationRule(),
    new CommaFrequencyRule(),
    new MixedWidthSpacingRule(),
    new BracketSpacingRule(),
    new KatakanaWidthRule(),
    new KatakanaChouonRule(),
    new JapanesePunctuationWidthRule(),
    new HeadingPeriodRule(),
    new AlphanumericHalfWidthRule(),
    new ListFormattingConsistencyRule(),
    new NakaguroUsageRule(),
    new WaveDashUnificationRule(),
    new IterationMarkRule(),
    new BracketPeriodPlacementRule(),
    new LargeNumberCommaRule(),
    new CounterCharacterRule(),
    new VuKatakanaRule(),
    new GairaiKanaTableRule(),
    new JiZuKanaRule(),
    new HistoricalKanaDetection(),
    new LongVowelKanaRule(),
    new VerbOkuriganaStrictRule(),
    new FixedOkuriganaNounRule(),
    new FormalNounOpeningRule(),
    new AuxiliaryVerbOpeningRule(),
    new ConjunctionOpeningRule(),
    new ParticleSuffixModifierOpeningRule(),
    new CompoundNounOkuriganaOmissionRule(),
    new PrefixScriptMatchingRule(),
    new PronounKanjiRule(),
    new DoubleNegativeRule(),
    new ParticleKaraYoriRule(),
    new ConjunctiveGaOveruseRule(),
    new SuruBekiConjugationRule(),
    new ConjunctionHierarchyRule(),
    new ConsecutiveParticleRule(),
    new TautologyRedundancyRule(),
    new OfficialStyleCopulaRule(),
    new LiteraryStyleExclusionRule(),
    new ExcessiveHonorificRule(),
    new ModifierLengthOrderRule(),
    new KanjiVerbOneCharDo(),
    new DesuMasuConsistencyRule(),
    new ConjunctionOveruseRule(),
    new WordRepetitionRule(),
    new TaigenDomeOveruseRule(),
    new PassiveOveruseRule(),
    new CounterWordMismatchRule(),
    new AdverbFormConsistencyRule(),
  ];
}

export function createJsonDrivenRules(): LintRule[] {
  return [
    ...createManuscriptL1Rules(),
    ...createJtfL1Rules(),
    ...createGendaiKanazukaiL1Rules(),
    ...createNihongoHyoukiL1Rules(),
  ];
}

/**
 * Built-in JTF ruleset manifest.
 *
 * Plain-data manifest for the "builtin.jtf" ruleset — readable without
 * executing any rule code. Every ruleId here is identical to the legacy
 * id produced by createJtfL1Rules() (e.g. "jtf-1-2-1").
 */
import type { RulesetManifest } from "@/lib/linting/sdk/ruleset-types";

export const MANIFEST: RulesetManifest = {
  id: "builtin.jtf",
  name: "JTF Japanese Style Guide (Built-in)",
  nameJa: "JTF日本語標準スタイルガイド（内蔵）",
  version: "1.0.0",
  engineApi: 1,
  license: "CC BY 4.0",
  maintainerEmail: "rulesets@illusions.app",
  rulesetPrefix: "jtf-",

  guidelines: [
    {
      id: "jtf-style-3",
      nameJa: "JTF日本語標準スタイルガイド",
      publisherJa: "日本翻訳連盟",
      year: 2019,
      license: "CC BY 4.0",
      descriptionJa: "翻訳・ローカライズ向けの日本語スタイルガイド",
    },
  ],

  rules: [
    // ---- 句読点 ----
    {
      ruleId: "jtf-1-2-1",
      nameJa: "句読点の統一",
      descriptionJa:
        "句点（。）と読点（、）について、JTFスタイルガイドの基準に従って表記を統一します",
      guidelineId: "jtf-style-3",
      level: "L1",
      defaultConfig: { enabled: true, severity: "warning" },
      applicableModes: ["novel", "official", "blog", "academic"],
      docs: {
        positiveExample: "これは正しい文章です。",
        negativeExample: "これは正しい文章です，全角カンマを使っています．",
        sourceReference: "JTF日本語標準スタイルガイド 1.2.1",
      },
    },
    {
      ruleId: "jtf-1-2-1-punctuation",
      nameJa: "句読点の全角統一",
      descriptionJa:
        "句読点には全角の「、」と「。」を使います。ピリオド（.）とカンマ（,）は使用しません",
      guidelineId: "jtf-style-3",
      level: "L1",
      defaultConfig: { enabled: true, severity: "warning" },
      applicableModes: ["novel", "official", "blog", "academic", "sns"],
      docs: {
        positiveExample: "これは正しい文章です。次の文もあります。",
        negativeExample: "これは正しい文章です,次の文もあります.",
        sourceReference: "JTF日本語標準スタイルガイド 1.2.1",
      },
    },
    {
      ruleId: "jtf-3-1-1",
      nameJa: "句点（。）の用法",
      descriptionJa: "句点（。）について、JTFスタイルガイドの基準に従って表記を統一します",
      guidelineId: "jtf-style-3",
      level: "L1",
      defaultConfig: { enabled: true, severity: "warning" },
      applicableModes: ["novel", "official", "blog", "academic"],
      docs: {
        positiveExample: "文章が終わりました。",
        negativeExample: "文章が終わりました.",
        sourceReference: "JTF日本語標準スタイルガイド 3.1.1",
      },
    },
    {
      ruleId: "jtf-3-1-1-kuten-brackets",
      nameJa: "閉じかっこ前の句点禁止",
      descriptionJa: "閉じかっこの前に句点（。）を打ちません",
      guidelineId: "jtf-style-3",
      level: "L1",
      defaultConfig: { enabled: true, severity: "warning" },
      applicableModes: ["novel", "official", "blog", "academic", "sns"],
      docs: {
        positiveExample: "「ありがとう」と言いました。",
        negativeExample: "「ありがとう。」と言いました。",
        sourceReference: "JTF日本語標準スタイルガイド 3.1.1",
      },
    },
    {
      ruleId: "jtf-3-1-3",
      nameJa: "ピリオド・カンマの用法",
      descriptionJa:
        "ピリオド（.）、カンマ（,）について、JTFスタイルガイドの基準に従って表記を統一します",
      guidelineId: "jtf-style-3",
      level: "L1",
      defaultConfig: { enabled: true, severity: "warning" },
      applicableModes: ["official", "blog", "academic"],
      docs: {
        positiveExample: "日本語の文章です。",
        negativeExample: "日本語の文章です.また別の文章です.",
        sourceReference: "JTF日本語標準スタイルガイド 3.1.3",
      },
    },
    // ---- 文字幅 ----
    {
      ruleId: "jtf-2-1-5-fullwidth-kana",
      nameJa: "カタカナの全角表記",
      descriptionJa: "漢字、ひらがな、カタカナは全角で表記します。半角カタカナは使用しません",
      guidelineId: "jtf-style-3",
      level: "L1",
      defaultConfig: { enabled: true, severity: "warning" },
      applicableModes: ["novel", "official", "blog", "academic", "sns"],
      docs: {
        positiveExample: "コンピュータを使います。",
        negativeExample: "ｺﾝﾋﾟｭｰﾀを使います。",
        sourceReference: "JTF日本語標準スタイルガイド 2.1.5",
      },
    },
    {
      ruleId: "jtf-2-1-8",
      nameJa: "算用数字の表記",
      descriptionJa: "算用数字について、JTFスタイルガイドの基準に従って表記を統一します",
      guidelineId: "jtf-style-3",
      level: "L1",
      defaultConfig: { enabled: true, severity: "warning" },
      applicableModes: ["official", "blog", "academic"],
      docs: {
        positiveExample: "123という数字です。",
        negativeExample: "１２３という数字です。",
        sourceReference: "JTF日本語標準スタイルガイド 2.1.8",
      },
    },
    {
      ruleId: "jtf-2-1-8-halfwidth-alnum",
      nameJa: "英数字の半角統一",
      descriptionJa: "算用数字とアルファベットは半角で表記します。全角の英数字は使用しません",
      guidelineId: "jtf-style-3",
      level: "L1",
      defaultConfig: { enabled: true, severity: "warning" },
      applicableModes: ["official", "blog", "academic"],
      docs: {
        positiveExample: "ABCと123です。",
        negativeExample: "ＡＢＣと１２３です。",
        sourceReference: "JTF日本語標準スタイルガイド 2.1.8",
      },
    },
    {
      ruleId: "jtf-2-1-10-digit-comma",
      nameJa: "算用数字の位取り",
      descriptionJa: "桁区切りには半角カンマ、小数点には半角ピリオドを使います",
      guidelineId: "jtf-style-3",
      level: "L1",
      defaultConfig: { enabled: true, severity: "warning" },
      applicableModes: ["official", "blog", "academic"],
      docs: {
        positiveExample: "1,234,567円です。",
        negativeExample: "1，234，567円です。",
        sourceReference: "JTF日本語標準スタイルガイド 2.1.10",
      },
    },
    // ---- 漢字・仮名 ----
    {
      ruleId: "jtf-2-2-1-kanji",
      nameJa: "漢字表記の推奨",
      descriptionJa: "特定の副詞などは、ひらがなではなく漢字で表記します",
      guidelineId: "jtf-style-3",
      level: "L1",
      defaultConfig: { enabled: true, severity: "info" },
      applicableModes: ["official", "blog", "academic"],
      docs: {
        positiveExample: "必ず確認してください。",
        negativeExample: "かならず確認してください。",
        sourceReference: "JTF日本語標準スタイルガイド 2.2.1",
      },
    },
    // ---- スペース ----
    {
      ruleId: "jtf-2-3-no-space",
      nameJa: "半角・全角間のスペース禁止",
      descriptionJa: "半角文字と全角文字の間に半角スペースを入れません",
      guidelineId: "jtf-style-3",
      level: "L1",
      defaultConfig: { enabled: true, severity: "info" },
      applicableModes: ["official", "blog", "academic"],
      docs: {
        positiveExample: "ABCの設定ファイルです。",
        negativeExample: "ABC の設定ファイルです。",
        sourceReference: "JTF日本語標準スタイルガイド 2.3",
      },
    },
    // ---- かっこ ----
    {
      ruleId: "jtf-3-3-1-parentheses-space",
      nameJa: "かっこ内外のスペース禁止",
      descriptionJa: "かっこの外側、内側ともにスペースを入れません",
      guidelineId: "jtf-style-3",
      level: "L1",
      defaultConfig: { enabled: true, severity: "warning" },
      applicableModes: ["novel", "official", "blog", "academic"],
      docs: {
        positiveExample: "（例）正しい表記です。",
        negativeExample: "（ 例 ）正しい表記です。",
        sourceReference: "JTF日本語標準スタイルガイド 3.3.1",
      },
    },
    {
      ruleId: "jtf-3-3-brackets-fullwidth",
      nameJa: "かっこの全角表記",
      descriptionJa: "丸かっこ、大かっこ、かぎかっこなどは原則として全角で表記します",
      guidelineId: "jtf-style-3",
      level: "L1",
      defaultConfig: { enabled: true, severity: "warning" },
      applicableModes: ["novel", "official", "blog", "academic"],
      docs: {
        positiveExample: "（例）正しい表記です。",
        negativeExample: "日本語の文章(例)です。",
        sourceReference: "JTF日本語標準スタイルガイド 3.3",
      },
    },
    // ---- 単位 ----
    {
      ruleId: "jtf-4-3-2",
      nameJa: "長さの単位表記",
      descriptionJa: "長さについて、SI単位（m、cm、mm、km）を正しく表記します",
      guidelineId: "jtf-style-3",
      level: "L1",
      defaultConfig: { enabled: true, severity: "warning" },
      applicableModes: ["official", "blog", "academic"],
      docs: {
        positiveExample: "全長は10kmです。",
        negativeExample: "全長は10KMです。",
        sourceReference: "JTF日本語標準スタイルガイド 4.3.2",
      },
    },
    {
      ruleId: "jtf-4-3-3",
      nameJa: "質量の単位表記",
      descriptionJa: "質量について、SI単位（g、kg、t）を正しく表記します",
      guidelineId: "jtf-style-3",
      level: "L1",
      defaultConfig: { enabled: true, severity: "warning" },
      applicableModes: ["official", "blog", "academic"],
      docs: {
        positiveExample: "重さは500gです。",
        negativeExample: "重さは500Gです。",
        sourceReference: "JTF日本語標準スタイルガイド 4.3.3",
      },
    },
    {
      ruleId: "jtf-4-3-4",
      nameJa: "面積・体積の単位表記",
      descriptionJa: "面積、体積について、SI単位（m²、m³、L）を正しく表記します",
      guidelineId: "jtf-style-3",
      level: "L1",
      defaultConfig: { enabled: true, severity: "warning" },
      applicableModes: ["official", "blog", "academic"],
      docs: {
        positiveExample: "面積は100m²です。",
        negativeExample: "面積は100m2です。",
        sourceReference: "JTF日本語標準スタイルガイド 4.3.4",
      },
    },
    {
      ruleId: "jtf-4-3-5",
      nameJa: "電気の単位表記",
      descriptionJa: "電気について、SI単位（V、A、W、Ω、Hz）を正しく表記します",
      guidelineId: "jtf-style-3",
      level: "L1",
      defaultConfig: { enabled: true, severity: "warning" },
      applicableModes: ["official", "blog", "academic"],
      docs: {
        positiveExample: "電圧は100Vです。",
        negativeExample: "電圧は100vです。",
        sourceReference: "JTF日本語標準スタイルガイド 4.3.5",
      },
    },
    {
      ruleId: "jtf-4-3-6",
      nameJa: "温度の単位表記",
      descriptionJa: "温度について、摂氏（℃）を正しく表記します",
      guidelineId: "jtf-style-3",
      level: "L1",
      defaultConfig: { enabled: true, severity: "warning" },
      applicableModes: ["official", "blog", "academic"],
      docs: {
        positiveExample: "気温は25℃です。",
        negativeExample: "気温は25°Cです。",
        sourceReference: "JTF日本語標準スタイルガイド 4.3.6",
      },
    },
    {
      ruleId: "jtf-4-3-7",
      nameJa: "周波数の単位表記",
      descriptionJa: "周波数について、SI単位（Hz、kHz、MHz、GHz）を正しく表記します",
      guidelineId: "jtf-style-3",
      level: "L1",
      defaultConfig: { enabled: true, severity: "warning" },
      applicableModes: ["official", "blog", "academic"],
      docs: {
        positiveExample: "周波数は2.4GHzです。",
        negativeExample: "周波数は2.4GHZです。",
        sourceReference: "JTF日本語標準スタイルガイド 4.3.7",
      },
    },
    {
      ruleId: "jtf-4-3-8",
      nameJa: "速度の単位表記",
      descriptionJa: "速度について、SI単位（m/s、km/h）を正しく表記します",
      guidelineId: "jtf-style-3",
      level: "L1",
      defaultConfig: { enabled: true, severity: "warning" },
      applicableModes: ["official", "blog", "academic"],
      docs: {
        positiveExample: "速度は100km/hです。",
        negativeExample: "速度は100KM/Hです。",
        sourceReference: "JTF日本語標準スタイルガイド 4.3.8",
      },
    },
    {
      ruleId: "jtf-4-3-9",
      nameJa: "伝送速度の単位表記",
      descriptionJa: "伝送速度について、単位（bps、kbps、Mbps、Gbps）を正しく表記します",
      guidelineId: "jtf-style-3",
      level: "L1",
      defaultConfig: { enabled: true, severity: "warning" },
      applicableModes: ["official", "blog", "academic"],
      docs: {
        positiveExample: "通信速度は100Mbpsです。",
        negativeExample: "通信速度は100MBPSです。",
        sourceReference: "JTF日本語標準スタイルガイド 4.3.9",
      },
    },
  ],
};

/**
 * Google Fonts Japanese Font Management
 * 
 * This module manages Japanese fonts from Google Fonts.
 * The font list is hardcoded and should be manually updated periodically.
 * Last updated: 2024-01-29
 */

export interface FontInfo {
  family: string;
  localizedName?: string; // Native language name (e.g., Japanese name for Japanese fonts)
  category: 'serif' | 'sans-serif' | 'display' | 'handwriting' | 'monospace';
  variants?: string[];
}

export type SystemFontPlatform = 'mac' | 'windows';

export interface SystemFontInfo extends FontInfo {
  platforms: SystemFontPlatform[];
}

/**
 * Featured Japanese fonts (displayed at the top of the selector)
 */
export const FEATURED_JAPANESE_FONTS: FontInfo[] = [
  { family: 'Noto Serif JP', localizedName: 'Noto 明朝', category: 'serif' },
  { family: 'Noto Sans JP', localizedName: 'Noto ゴシック', category: 'sans-serif' },
  { family: 'Shippori Mincho', localizedName: 'しっぽり明朝', category: 'serif' },
  { family: 'Zen Kaku Gothic New', localizedName: '禅角ゴシック New', category: 'sans-serif' },
  { family: 'M PLUS Rounded 1c', localizedName: 'Mプラス 丸ゴシック 1c', category: 'sans-serif' },
];

export const LOCAL_SYSTEM_FONTS: SystemFontInfo[] = [
  {
    family: 'Hiragino Mincho ProN',
    localizedName: 'ヒラギノ明朝 ProN',
    category: 'serif',
    platforms: ['mac'],
  },
  {
    family: 'Hiragino Kaku Gothic ProN',
    localizedName: 'ヒラギノ角ゴ ProN',
    category: 'sans-serif',
    platforms: ['mac'],
  },
  {
    family: 'Yu Mincho',
    localizedName: '游明朝',
    category: 'serif',
    platforms: ['mac', 'windows'],
  },
  {
    family: 'Yu Gothic',
    localizedName: '游ゴシック',
    category: 'sans-serif',
    platforms: ['mac', 'windows'],
  },
  {
    family: 'Tsukushi Mincho',
    localizedName: '筑紫明朝',
    category: 'serif',
    platforms: ['mac'],
  },
  {
    family: 'Tsukushi A Round Gothic',
    localizedName: '筑紫A丸ゴシック',
    category: 'sans-serif',
    platforms: ['mac'],
  },
  {
    family: 'Meiryo',
    localizedName: 'メイリオ',
    category: 'sans-serif',
    platforms: ['windows'],
  },
  {
    family: 'MS Mincho',
    localizedName: 'MS 明朝',
    category: 'serif',
    platforms: ['windows'],
  },
  {
    family: 'MS Gothic',
    localizedName: 'MS ゴシック',
    category: 'sans-serif',
    platforms: ['windows'],
  },
  {
    family: 'BIZ UDGothic',
    localizedName: 'BIZ UDゴシック',
    category: 'sans-serif',
    platforms: ['windows'],
  },
  {
    family: 'BIZ UDPGothic',
    localizedName: 'BIZ UDPゴシック',
    category: 'sans-serif',
    platforms: ['windows'],
  },
  {
    family: 'BIZ UDMincho',
    localizedName: 'BIZ UD明朝',
    category: 'serif',
    platforms: ['windows'],
  },
  {
    family: 'BIZ UDPMincho',
    localizedName: 'BIZ UDP明朝',
    category: 'serif',
    platforms: ['windows'],
  },
];

const LOCAL_FONT_FAMILY_SET = new Set<string>([
  ...FEATURED_JAPANESE_FONTS.map((f) => f.family),
  ...LOCAL_SYSTEM_FONTS.map((f) => f.family),
  'Fira Code',
]);

/**
 * Complete list of Japanese fonts available on Google Fonts
 * Source: https://fonts.google.com/?subset=japanese
 * 
 * Categories:
 * - serif: 明朝体 (Mincho/Ming)
 * - sans-serif: ゴシック体 (Gothic)
 * - display: デザイン書体 (Display/Decorative)
 * - handwriting: 手書き風 (Handwriting style)
 */
export const ALL_JAPANESE_FONTS: FontInfo[] = [
  // Noto Family
  { family: 'Noto Serif JP', localizedName: 'Noto 明朝', category: 'serif' },
  { family: 'Noto Sans JP', localizedName: 'Noto ゴシック', category: 'sans-serif' },
  
  // M PLUS Family
  { family: 'M PLUS 1', localizedName: 'Mプラス 1', category: 'sans-serif' },
  { family: 'M PLUS 2', localizedName: 'Mプラス 2', category: 'sans-serif' },
  { family: 'M PLUS 1p', localizedName: 'Mプラス 1p', category: 'sans-serif' },
  { family: 'M PLUS Rounded 1c', localizedName: 'Mプラス 丸ゴシック 1c', category: 'sans-serif' },
  { family: 'M PLUS 1 Code', localizedName: 'Mプラス 1 コード', category: 'monospace' },
  { family: 'M PLUS Code Latin', localizedName: 'Mプラス コード Latin', category: 'monospace' },
  
  // Zen Family
  { family: 'Zen Kaku Gothic New', localizedName: '禅角ゴシック New', category: 'sans-serif' },
  { family: 'Zen Kaku Gothic Antique', localizedName: '禅角ゴシック アンティーク', category: 'sans-serif' },
  { family: 'Zen Maru Gothic', localizedName: '禅丸ゴシック', category: 'sans-serif' },
  { family: 'Zen Old Mincho', localizedName: '禅オールド明朝', category: 'serif' },
  { family: 'Zen Antique', localizedName: '禅アンティーク', category: 'serif' },
  { family: 'Zen Antique Soft', localizedName: '禅アンティーク ソフト', category: 'serif' },
  { family: 'Zen Kurenaido', localizedName: '禅紅藍', category: 'sans-serif' },
  { family: 'Zen Tokyo Zoo', localizedName: '禅東京ズー', category: 'display' },
  
  // Shippori Family
  { family: 'Shippori Mincho', localizedName: 'しっぽり明朝', category: 'serif' },
  { family: 'Shippori Mincho B1', localizedName: 'しっぽり明朝 B1', category: 'serif' },
  { family: 'Shippori Antique', localizedName: 'しっぽりアンティーク', category: 'sans-serif' },
  { family: 'Shippori Antique B1', localizedName: 'しっぽりアンティーク B1', category: 'sans-serif' },
  
  // Sawarabi Family
  { family: 'Sawarabi Mincho', localizedName: 'さわらび明朝', category: 'serif' },
  { family: 'Sawarabi Gothic', localizedName: 'さわらびゴシック', category: 'sans-serif' },
  
  // Kosugi Family
  { family: 'Kosugi', localizedName: '小杉ゴシック', category: 'sans-serif' },
  { family: 'Kosugi Maru', localizedName: '小杉丸ゴシック', category: 'sans-serif' },
  
  // BIZ UD Family (Business & Education)
  { family: 'BIZ UDPGothic', localizedName: 'BIZ UDPゴシック', category: 'sans-serif' },
  { family: 'BIZ UDGothic', localizedName: 'BIZ UDゴシック', category: 'sans-serif' },
  { family: 'BIZ UDPMincho', localizedName: 'BIZ UDP明朝', category: 'serif' },
  { family: 'BIZ UDMincho', localizedName: 'BIZ UD明朝', category: 'serif' },
  
  // Kaisei Family
  { family: 'Kaisei Decol', localizedName: '解星デコール', category: 'serif' },
  { family: 'Kaisei Opti', localizedName: '解星オプティ', category: 'serif' },
  { family: 'Kaisei Tokumin', localizedName: '解星特ミン', category: 'serif' },
  { family: 'Kaisei HarunoUmi', localizedName: '解星ハルノウミ', category: 'serif' },
  
  // Yuji Family
  { family: 'Yuji Syuku', localizedName: '游字祝', category: 'serif' },
  { family: 'Yuji Boku', localizedName: '游字墨', category: 'serif' },
  { family: 'Yuji Mai', localizedName: '游字舞', category: 'serif' },
  
  // Mochiy Pop Family
  { family: 'Mochiy Pop One', localizedName: 'もちポップ One', category: 'handwriting' },
  { family: 'Mochiy Pop P One', localizedName: 'もちポップ P One', category: 'handwriting' },
  
  // Klee Family
  { family: 'Klee One', localizedName: 'クレー One', category: 'handwriting' },
  
  // Potta Family
  { family: 'Potta One', localizedName: 'ポッタ One', category: 'display' },
  
  // Display & Decorative Fonts
  { family: 'Dela Gothic One', localizedName: 'デラゴシック One', category: 'display' },
  { family: 'Hachi Maru Pop', localizedName: 'はち丸ポップ', category: 'handwriting' },
  { family: 'Kiwi Maru', localizedName: 'キウイ丸', category: 'sans-serif' },
  { family: 'Yusei Magic', localizedName: '油性マジック', category: 'sans-serif' },
  { family: 'Reggae One', localizedName: 'レゲエ One', category: 'display' },
  { family: 'Stick', localizedName: 'ステッキ', category: 'sans-serif' },
  { family: 'RocknRoll One', localizedName: 'ロックンロール One', category: 'sans-serif' },
  { family: 'DotGothic16', localizedName: 'ドットゴシック16', category: 'display' },
  { family: 'Rampart One', localizedName: 'ランパート One', category: 'display' },
  { family: 'Train One', localizedName: 'トレイン One', category: 'display' },
  { family: 'Yomogi', localizedName: 'よもぎ', category: 'handwriting' },
  { family: 'New Tegomin', localizedName: 'ニュー鉄ゴミン', category: 'serif' },
  { family: 'Shizuru', localizedName: 'しずる', category: 'display' },
  { family: 'Murecho', localizedName: 'ムレチョ', category: 'sans-serif' },
  { family: 'Hina Mincho', localizedName: 'ひな明朝', category: 'serif' },
  { family: 'Stick No Bills', localizedName: 'スティック ノービルズ', category: 'sans-serif' },
  { family: 'Otomanopee One', localizedName: 'おとまのぴー One', category: 'display' },
  { family: 'Slackside One', localizedName: 'スラックサイド One', category: 'handwriting' },
  { family: 'Darumadrop One', localizedName: 'だるまどろっぷ One', category: 'display' },
  { family: 'Monomaniac One', localizedName: 'モノマニアック One', category: 'display' },
  { family: 'Palette Mosaic', localizedName: 'パレット モザイク', category: 'display' },
  { family: 'Cherry Bomb One', localizedName: 'チェリーボム One', category: 'display' },
  { family: 'Tsukimi Rounded', localizedName: '月見丸', category: 'sans-serif' },
  { family: 'Kaiso Next JP', localizedName: '改装ネクスト', category: 'sans-serif' },
  { family: 'Nunito Sans', localizedName: 'Nunito Sans', category: 'sans-serif' },
  { family: 'Zen Dots', localizedName: '禅ドット', category: 'display' },
  { family: 'Aubrey', localizedName: 'オーブリー', category: 'handwriting' },
  { family: 'Genkeki Gothic', localizedName: '現劇ゴシック', category: 'sans-serif' },
  { family: 'Sour Gummy', localizedName: 'サワーグミ', category: 'sans-serif' },
];

/**
 * Load a Google Font dynamically by adding a <link> tag to the document head
 * @param fontFamily - The font family name (e.g., "Noto Serif JP")
 */
export function loadGoogleFont(fontFamily: string): void {
  if (LOCAL_FONT_FAMILY_SET.has(fontFamily)) {
    return;
  }

  // Check if font is already loaded
  const fontUrl = fontFamily.replace(/\s+/g, '+');
  const existingLink = document.querySelector(`link[href*="${fontUrl}"]`);
  
  if (existingLink) {
    return; // Font already loaded
  }
  
  // Create and append link tag
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${fontUrl}:wght@400;700&display=swap`;
  document.head.appendChild(link);
}

export function isElectronRuntime(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const win = window as typeof window & {
    process?: { versions?: { electron?: string } };
  };

  return Boolean(win.process?.versions?.electron) || window.navigator.userAgent.includes('Electron');
}

export async function ensureLocalFontAvailable(fontFamily: string): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) {
    return;
  }

  try {
    await document.fonts.load(`16px "${fontFamily}"`);
    const available = document.fonts.check(`16px "${fontFamily}"`);
    if (!available) {
      // eslint-disable-next-line no-console
      console.error(`[fonts] Local font unavailable: ${fontFamily}`);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[fonts] Failed to check local font: ${fontFamily}`, error);
  }
}

/**
 * Preload featured fonts on application start
 */
export function preloadFeaturedFonts(): void {
  FEATURED_JAPANESE_FONTS.forEach(font => {
    loadGoogleFont(font.family);
  });
}

/**
 * Get font fallback based on category
 */
export function getFontFallback(category: FontInfo['category']): string {
  switch (category) {
    case 'serif':
      return 'serif';
    case 'sans-serif':
      return 'sans-serif';
    case 'monospace':
      return 'monospace';
    case 'handwriting':
    case 'display':
      return 'cursive, sans-serif';
    default:
      return 'sans-serif';
  }
}

/**
 * Get complete font-family CSS value with fallbacks
 */
export function getFontFamilyCSS(fontFamily: string): string {
  const font = ALL_JAPANESE_FONTS.find(f => f.family === fontFamily);
  const fallback = font ? getFontFallback(font.category) : 'sans-serif';
  return `"${fontFamily}", ${fallback}`;
}

/**
 * Google Fonts Japanese Font Management
 * 
 * This module manages Japanese fonts from Google Fonts.
 * The font list is hardcoded and should be manually updated periodically.
 * Last updated: 2024-01-29
 */

export interface FontInfo {
  family: string;
  category: 'serif' | 'sans-serif' | 'display' | 'handwriting' | 'monospace';
  variants?: string[];
}

/**
 * Featured Japanese fonts (displayed at the top of the selector)
 */
export const FEATURED_JAPANESE_FONTS: FontInfo[] = [
  { family: 'Noto Serif JP', category: 'serif' },
  { family: 'Noto Sans JP', category: 'sans-serif' },
  { family: 'Shippori Mincho', category: 'serif' },
  { family: 'Zen Kaku Gothic New', category: 'sans-serif' },
  { family: 'M PLUS Rounded 1c', category: 'sans-serif' },
];

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
  { family: 'Noto Serif JP', category: 'serif' },
  { family: 'Noto Sans JP', category: 'sans-serif' },
  
  // M PLUS Family
  { family: 'M PLUS 1', category: 'sans-serif' },
  { family: 'M PLUS 2', category: 'sans-serif' },
  { family: 'M PLUS 1p', category: 'sans-serif' },
  { family: 'M PLUS Rounded 1c', category: 'sans-serif' },
  { family: 'M PLUS 1 Code', category: 'monospace' },
  { family: 'M PLUS Code Latin', category: 'monospace' },
  
  // Zen Family
  { family: 'Zen Kaku Gothic New', category: 'sans-serif' },
  { family: 'Zen Kaku Gothic Antique', category: 'sans-serif' },
  { family: 'Zen Maru Gothic', category: 'sans-serif' },
  { family: 'Zen Old Mincho', category: 'serif' },
  { family: 'Zen Antique', category: 'serif' },
  { family: 'Zen Antique Soft', category: 'serif' },
  { family: 'Zen Kurenaido', category: 'sans-serif' },
  { family: 'Zen Tokyo Zoo', category: 'display' },
  
  // Shippori Family
  { family: 'Shippori Mincho', category: 'serif' },
  { family: 'Shippori Mincho B1', category: 'serif' },
  { family: 'Shippori Antique', category: 'sans-serif' },
  { family: 'Shippori Antique B1', category: 'sans-serif' },
  
  // Sawarabi Family
  { family: 'Sawarabi Mincho', category: 'serif' },
  { family: 'Sawarabi Gothic', category: 'sans-serif' },
  
  // Kosugi Family
  { family: 'Kosugi', category: 'sans-serif' },
  { family: 'Kosugi Maru', category: 'sans-serif' },
  
  // BIZ UD Family (Business & Education)
  { family: 'BIZ UDPGothic', category: 'sans-serif' },
  { family: 'BIZ UDGothic', category: 'sans-serif' },
  { family: 'BIZ UDPMincho', category: 'serif' },
  { family: 'BIZ UDMincho', category: 'serif' },
  
  // Kaisei Family
  { family: 'Kaisei Decol', category: 'serif' },
  { family: 'Kaisei Opti', category: 'serif' },
  { family: 'Kaisei Tokumin', category: 'serif' },
  { family: 'Kaisei HarunoUmi', category: 'serif' },
  
  // Yuji Family
  { family: 'Yuji Syuku', category: 'serif' },
  { family: 'Yuji Boku', category: 'serif' },
  { family: 'Yuji Mai', category: 'serif' },
  
  // Mochiy Pop Family
  { family: 'Mochiy Pop One', category: 'handwriting' },
  { family: 'Mochiy Pop P One', category: 'handwriting' },
  
  // Klee Family
  { family: 'Klee One', category: 'handwriting' },
  
  // Potta Family
  { family: 'Potta One', category: 'display' },
  
  // Display & Decorative Fonts
  { family: 'Dela Gothic One', category: 'display' },
  { family: 'Hachi Maru Pop', category: 'handwriting' },
  { family: 'Kiwi Maru', category: 'sans-serif' },
  { family: 'Yusei Magic', category: 'sans-serif' },
  { family: 'Reggae One', category: 'display' },
  { family: 'Stick', category: 'sans-serif' },
  { family: 'RocknRoll One', category: 'sans-serif' },
  { family: 'DotGothic16', category: 'display' },
  { family: 'Rampart One', category: 'display' },
  { family: 'Train One', category: 'display' },
  { family: 'Yomogi', category: 'handwriting' },
  { family: 'New Tegomin', category: 'serif' },
  { family: 'Shizuru', category: 'display' },
  { family: 'Murecho', category: 'sans-serif' },
  { family: 'Hina Mincho', category: 'serif' },
  { family: 'Stick No Bills', category: 'sans-serif' },
  { family: 'Otomanopee One', category: 'display' },
  { family: 'Slackside One', category: 'handwriting' },
  { family: 'Darumadrop One', category: 'display' },
  { family: 'Monomaniac One', category: 'display' },
  { family: 'Palette Mosaic', category: 'display' },
  { family: 'Cherry Bomb One', category: 'display' },
  { family: 'Tsukimi Rounded', category: 'sans-serif' },
  { family: 'Kaiso Next JP', category: 'sans-serif' },
  { family: 'Nunito Sans', category: 'sans-serif' },
  { family: 'Zen Dots', category: 'display' },
  { family: 'Aubrey', category: 'handwriting' },
  { family: 'Genkeki Gothic', category: 'sans-serif' },
  { family: 'Sour Gummy', category: 'sans-serif' },
];

/**
 * Load a Google Font dynamically by adding a <link> tag to the document head
 * @param fontFamily - The font family name (e.g., "Noto Serif JP")
 */
export function loadGoogleFont(fontFamily: string): void {
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

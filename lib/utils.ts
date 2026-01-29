/**
 * Utility functions for the Illusions editor
 */

/**
 * Calculate manuscript pages (原稿用紙) from character count
 * Standard Japanese manuscript paper: 400 characters per page
 */
export function calculateManuscriptPages(charCount: number): number {
  return Math.ceil(charCount / 400);
}

/**
 * Count words in text (handles both Japanese and English)
 */
export function countWords(text: string): number {
  // Remove markdown syntax
  const plainText = text
    .replace(/[#*_~`\[\]()]/g, '')
    .trim();
  
  // Split by whitespace and filter empty strings
  const words = plainText.split(/\s+/).filter(Boolean);
  return words.length;
}

/**
 * Count characters excluding whitespace
 */
export function countCharacters(text: string): number {
  return text.replace(/\s/g, '').length;
}

/**
 * Format date for display (Japanese locale)
 */
export function formatDate(date: Date): string {
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format relative time (e.g., "3分前")
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diff < 60) return '今';
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
  return `${Math.floor(diff / 86400)}日前`;
}

/**
 * Debounce function for auto-save
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Generate unique ID for documents
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if text contains Japanese characters
 */
export function hasJapanese(text: string): boolean {
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
}

/**
 * Validate document title
 */
export function validateTitle(title: string): { valid: boolean; error?: string } {
  if (!title || title.trim().length === 0) {
    return { valid: false, error: 'タイトルを入力してください' };
  }
  if (title.length > 100) {
    return { valid: false, error: 'タイトルは100文字以内にしてください' };
  }
  return { valid: true };
}

/**
 * Clean markdown for character counting
 */
export function cleanMarkdown(markdown: string): string {
  return markdown
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, '')
    // Remove inline code
    .replace(/`[^`]+`/g, '')
    // Remove links but keep text
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    // Remove images
    .replace(/!\[([^\]]*)\]\([^\)]+\)/g, '')
    // Remove headers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold/italic markers
    .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1')
    // Remove blockquotes
    .replace(/^>\s+/gm, '')
    // Remove horizontal rules
    .replace(/^[-*_]{3,}$/gm, '')
    .trim();
}

/**
 * Export statistics
 */
export interface TextStatistics {
  wordCount: number;
  charCount: number;
  manuscriptPages: number;
  paragraphCount: number;
  hasJapanese: boolean;
}

export function calculateStatistics(text: string): TextStatistics {
  const cleanedText = cleanMarkdown(text);
  const charCount = countCharacters(cleanedText);
  const wordCount = countWords(cleanedText);
  const manuscriptPages = calculateManuscriptPages(charCount);
  const paragraphCount = text.split(/\n\n+/).filter(Boolean).length;

  return {
    wordCount,
    charCount,
    manuscriptPages,
    paragraphCount,
    hasJapanese: hasJapanese(text),
  };
}

/**
 * Generate heading ID from title content using URL encoding
 */
export function generateHeadingId(title: string): string {
  // Remove markdown formatting and trim
  const cleanTitle = title
    .replace(/[*_~`\[\]()]/g, '')
    .trim();
  
  // URL encode the title
  return encodeURIComponent(cleanTitle);
}

/**
 * Parse markdown headings to extract chapters
 */
export interface Chapter {
  level: number;
  title: string;
  lineNumber: number;
  charOffset: number;
  anchorId?: string;
}

export function parseMarkdownChapters(markdown: string): Chapter[] {
  const lines = markdown.split('\n');
  const chapters: Chapter[] = [];
  let charOffset = 0;

  lines.forEach((line, lineNumber) => {
    // Match heading pattern: # Title, ## Title, etc.
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const title = match[2].trim();
      const anchorId = generateHeadingId(title);
      
      chapters.push({
        level,
        title,
        lineNumber,
        charOffset,
        anchorId,
      });
    }
    charOffset += line.length + 1; // +1 for newline
  });

  return chapters;
}

/**
 * Extract chapters from editor DOM
 * This is more reliable than parsing markdown as it gets actual IDs from rendered elements
 */
export function getChaptersFromDOM(): Chapter[] {
  const chapters: Chapter[] = [];
  
  // Check if we're in a browser environment
  if (typeof document === 'undefined') {
    return chapters;
  }
  
  const editorContent = document.querySelector('.milkdown');
  
  if (!editorContent) return chapters;
  
  // Find all headings with id
  const headings = editorContent.querySelectorAll('h1, h2, h3, h4, h5, h6');
  
  headings.forEach((heading, index) => {
    const level = parseInt(heading.tagName[1]);
    const anchorId = heading.id;
    const title = heading.textContent || '';
    
    chapters.push({
      level,
      title,
      lineNumber: index,
      charOffset: 0,
      anchorId: anchorId || undefined,
    });
  });
  
  return chapters;
}


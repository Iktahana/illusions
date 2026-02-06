/**
 * Type definitions for Illusions
 */

export interface NovelDocument {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  chapters?: Chapter[];
  metadata?: NovelMetadata;
}

export interface Chapter {
  id: string;
  title: string;
  content: string;
  order: number;
  parentId?: string;
  children?: Chapter[];
}

export interface NovelMetadata {
  author?: string;
  description?: string;
  genre?: string;
  tags?: string[];
  wordCount?: number;
  characterCount?: number;
  manuscriptPages?: number;
  language?: 'ja' | 'en' | 'zh-TW';
}

export interface EditorSettings {
  fontScale: number; // Font scale in percentage (50-200, where 100 = 100%)
  lineHeight: number;
  fontFamily: string;
  isVertical: boolean;
  theme: 'light' | 'dark';
  textIndent: number; // Text indent in em units (e.g., 1 = 1em)
  charsPerLine: number; // Character limit per line/column (0 = no limit, 10-50)
}

export interface UserPreferences {
  autoSave: boolean;
  autoSaveInterval: number; // in milliseconds
  showWordCount: boolean;
  showManuscriptPages: boolean;
  enableAIAssistant: boolean;
  enableGrammarCheck: boolean;
}

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface Correction {
  id: string;
  type: 'warning' | 'info' | 'error';
  message: string;
  context: string;
  line: number;
  column?: number;
  suggestion?: string;
}

export interface WritingStatistics {
  today: number;
  thisWeek: number;
  thisMonth: number;
  total: number;
  averagePerDay: number;
}

// Storage related types
export type StorageProvider = 'mock' | 'local' | 'google-drive' | 'synology';

export interface StorageConfig {
  provider: StorageProvider;
  config?: Record<string, any>;
}

// UI State types
export type SidebarTab = 'chapters' | 'settings' | 'style';
export type InspectorTab = 'ai' | 'corrections' | 'stats' | 'history';

export interface UIState {
  sidebarTab: SidebarTab;
  inspectorTab: InspectorTab;
  isSidebarOpen: boolean;
  isInspectorOpen: boolean;
}

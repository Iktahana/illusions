/**
 * Storage Adapter Interface
 * This interface defines the contract for storage implementations
 * Future implementations: Google Drive, Synology NAS, Local Storage
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
}

export interface NovelMetadata {
  author?: string;
  description?: string;
  genre?: string;
  tags?: string[];
  wordCount?: number;
  characterCount?: number;
}

export interface StorageAdapter {
  /**
   * Initialize the storage connection
   */
  initialize(): Promise<void>;

  /**
   * Save a document to storage
   */
  save(document: NovelDocument): Promise<void>;

  /**
   * Load a document from storage
   */
  load(documentId: string): Promise<NovelDocument | null>;

  /**
   * List all documents
   */
  list(): Promise<NovelDocument[]>;

  /**
   * Delete a document
   */
  delete(documentId: string): Promise<void>;

  /**
   * Check connection status
   */
  isConnected(): boolean;
}

/**
 * Mock Storage Implementation (Local Memory)
 * This is a placeholder for development
 */
export class MockStorageAdapter implements StorageAdapter {
  private documents: Map<string, NovelDocument> = new Map();
  private connected: boolean = false;

  async initialize(): Promise<void> {
    this.connected = true;
    // Load sample document
    const sampleDoc: NovelDocument = {
      id: "sample-1",
      title: "新しい物語",
      content: "# 第一章\n\nここから物語が始まります...",
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        author: "作者名",
        description: "これは日本語小説のサンプルです。",
        wordCount: 0,
        characterCount: 0,
      },
    };
    this.documents.set(sampleDoc.id, sampleDoc);
  }

  async save(document: NovelDocument): Promise<void> {
    if (!this.connected) {
      throw new Error("Storage not initialized");
    }
    document.updatedAt = new Date();
    this.documents.set(document.id, document);
  }

  async load(documentId: string): Promise<NovelDocument | null> {
    if (!this.connected) {
      throw new Error("Storage not initialized");
    }
    return this.documents.get(documentId) || null;
  }

  async list(): Promise<NovelDocument[]> {
    if (!this.connected) {
      throw new Error("Storage not initialized");
    }
    return Array.from(this.documents.values());
  }

  async delete(documentId: string): Promise<void> {
    if (!this.connected) {
      throw new Error("Storage not initialized");
    }
    this.documents.delete(documentId);
  }

  isConnected(): boolean {
    return this.connected;
  }
}

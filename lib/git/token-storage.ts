/**
 * Token Storage Service
 * 
 * Secure storage of GitHub OAuth tokens for both Electron and Web platforms.
 * - Electron: Uses electron-store with encryption
 * - Web: Uses IndexedDB with Web Crypto API encryption
 */

/**
 * Abstract token storage interface
 */
interface ITokenStorage {
  saveToken(token: string): Promise<void>;
  getToken(): Promise<string | null>;
  clearToken(): Promise<void>;
}

/**
 * Electron implementation using electron-store
 */
class ElectronTokenStorage implements ITokenStorage {
  private store: any;
  private readonly tokenKey = 'github.token';

  constructor() {
    // electron-store will be imported dynamically in Electron context
    if (typeof window === 'undefined') {
      // Server-side (Electron main process)
      try {
        const Store = require('electron-store');
        this.store = new Store({
          encryptionKey: 'illusions-secret-key-v1',
        });
      } catch (error) {
        console.warn('electron-store not available in this context');
      }
    }
  }

  async saveToken(token: string): Promise<void> {
    if (!this.store) {
      throw new Error('Token storage not initialized');
    }
    this.store.set(this.tokenKey, token);
  }

  async getToken(): Promise<string | null> {
    if (!this.store) {
      return null;
    }
    return this.store.get(this.tokenKey) || null;
  }

  async clearToken(): Promise<void> {
    if (!this.store) {
      return;
    }
    this.store.delete(this.tokenKey);
  }
}

/**
 * Web implementation using IndexedDB with Web Crypto API encryption
 */
class WebTokenStorage implements ITokenStorage {
  private readonly dbName = 'illusions-git';
  private readonly storeName = 'tokens';
  private readonly tokenKey = 'github-token';
  private db: IDBDatabase | null = null;

  constructor() {
    this.initializeDb();
  }

  private async initializeDb(): Promise<IDBDatabase> {
    if (this.db) {
      return this.db;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
    });
  }

  private async encryptToken(token: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);

    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    const exportedKey = await crypto.subtle.exportKey('raw', key);

    const combined = new Uint8Array(iv.length + encrypted.byteLength + exportedKey.byteLength);
    combined.set(new Uint8Array(iv), 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    combined.set(new Uint8Array(exportedKey), iv.length + encrypted.byteLength);

    return btoa(String.fromCharCode(...combined));
  }

  private async decryptToken(encrypted: string): Promise<string> {
    try {
      const combined = new Uint8Array(
        atob(encrypted)
          .split('')
          .map((char) => char.charCodeAt(0))
      );

      const iv = combined.slice(0, 12);
      const encryptedData = combined.slice(12, combined.length - 32);
      const keyData = combined.slice(combined.length - 32);

      const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'AES-GCM' },
        true,
        ['decrypt']
      );

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encryptedData
      );

      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      throw new Error('Failed to decrypt token');
    }
  }

  async saveToken(token: string): Promise<void> {
    const db = await this.initializeDb();
    const encrypted = await this.encryptToken(token);

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(encrypted, this.tokenKey);

      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  }

  async getToken(): Promise<string | null> {
    const db = await this.initializeDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(this.tokenKey);

      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = async () => {
        const encrypted = request.result;
        if (!encrypted) {
          resolve(null);
          return;
        }

        try {
          const token = await this.decryptToken(encrypted);
          resolve(token);
        } catch (error) {
          console.error('Failed to decrypt token:', error);
          resolve(null);
        }
      };
    });
  }

  async clearToken(): Promise<void> {
    const db = await this.initializeDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(this.tokenKey);

      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  }
}

/**
 * Factory function to get the appropriate token storage implementation
 */
export function createTokenStorage(): ITokenStorage {
  // Check if we're in Electron context
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    return new ElectronTokenStorage();
  }

  // Check if we're in a browser with IndexedDB support
  if (typeof indexedDB !== 'undefined') {
    return new WebTokenStorage();
  }

  throw new Error('No suitable token storage available');
}

/**
 * Singleton instance
 */
let tokenStorageInstance: ITokenStorage | null = null;

export function getTokenStorage(): ITokenStorage {
  if (!tokenStorageInstance) {
    tokenStorageInstance = createTokenStorage();
  }
  return tokenStorageInstance;
}

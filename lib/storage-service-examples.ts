/**
 * StorageService Usage Examples
 * 
 * This file demonstrates common usage patterns for the StorageService
 * across Web and Electron environments.
 */

import type { StorageSession, RecentFile, AppState } from "@/lib/storage-types";
import { getStorageService } from "@/lib/storage-service";

// ============================================================================
// Example 1: Initializing the storage service
// ============================================================================

export async function initializeStorage(): Promise<void> {
  const storage = getStorageService();
  
  // Initialize is called automatically on first use, but can be called explicitly
  await storage.initialize();
  
  console.log("Storage service initialized successfully");
}

// ============================================================================
// Example 2: Loading session state on app startup
// ============================================================================

export async function restoreSessionOnStartup(): Promise<void> {
  const storage = getStorageService();
  
  const session = await storage.loadSession();
  
  if (!session) {
    console.log("No previous session found, showing welcome screen");
    // Show welcome screen or create new document
    return;
  }
  
  // Restore last opened file
  if (session.appState.lastOpenedMdiPath) {
    console.log(`Opening file: ${session.appState.lastOpenedMdiPath}`);
    // Load file from path
  }
  
  // Restore unsaved content if available
  if (session.editorBuffer) {
    const timeSinceLastSave = Date.now() - session.editorBuffer.timestamp;
    const hoursSince = Math.floor(timeSinceLastSave / (1000 * 60 * 60));
    
    console.log(
      `Found unsaved content from ${hoursSince} hours ago. Restore? (Y/n)`
    );
    // Prompt user to restore
  }
  
  console.log(`Recent files: ${session.recentFiles.length}`);
  session.recentFiles.forEach((file) => {
    console.log(`  - ${file.name} (${new Date(file.lastModified).toLocaleString()})`);
  });
}

// ============================================================================
// Example 3: Saving complete session state
// ============================================================================

export async function saveCompleteSession(
  filePath: string,
  editorContent: string
): Promise<void> {
  const storage = getStorageService();
  
  const session: StorageSession = {
    appState: {
      lastOpenedMdiPath: filePath,
    },
    recentFiles: [], // Will be populated by addToRecent
    editorBuffer: {
      content: editorContent,
      timestamp: Date.now(),
    },
  };
  
  await storage.saveSession(session);
  console.log("Session saved successfully");
}

// ============================================================================
// Example 4: Adding to recent files (with auto-limit of 10)
// ============================================================================

export async function addFileToRecent(
  filePath: string,
  fileName: string,
  content: string
): Promise<void> {
  const storage = getStorageService();
  
  // Extract snippet (first 100 characters)
  const snippet = content
    .split("\n")
    .slice(0, 3)
    .join("\n")
    .substring(0, 100);
  
  const recentFile: RecentFile = {
    name: fileName,
    path: filePath,
    lastModified: Date.now(),
    snippet,
  };
  
  await storage.addToRecent(recentFile);
  console.log(`Added "${fileName}" to recent files`);
  
  // Display updated recent files
  const recent = await storage.getRecentFiles();
  console.log(`Total recent files: ${recent.length}`);
}

// ============================================================================
// Example 5: Auto-save editor buffer every 30 seconds
// ============================================================================

export function setupAutoSave(editorContent: string): () => void {
  const storage = getStorageService();
  
  const autoSaveInterval = setInterval(async () => {
    try {
      await storage.saveEditorBuffer({
        content: editorContent,
        timestamp: Date.now(),
      });
      console.log(`[${new Date().toLocaleTimeString()}] Auto-saved buffer`);
    } catch (error) {
      console.error("Auto-save failed:", error);
    }
  }, 30000); // Every 30 seconds
  
  // Return cleanup function
  return () => clearInterval(autoSaveInterval);
}

// ============================================================================
// Example 6: Handling unsaved content on app close
// ============================================================================

export async function handleBeforeClose(
  editorContent: string,
  isDirty: boolean
): Promise<void> {
  const storage = getStorageService();
  
  if (isDirty) {
    // Save current work
    await storage.saveEditorBuffer({
      content: editorContent,
      timestamp: Date.now(),
    });
    
    console.log("Unsaved work saved to editor buffer");
  }
}

// ============================================================================
// Example 7: Displaying recent files in a menu
// ============================================================================

export async function displayRecentFilesMenu(): Promise<void> {
  const storage = getStorageService();
  
  const recent = await storage.getRecentFiles();
  
  if (recent.length === 0) {
    console.log("No recent files");
    return;
  }
  
  console.log("Recent Files:");
  console.log("=".repeat(50));
  
  recent.forEach((file, index) => {
    const lastModified = new Date(file.lastModified).toLocaleString();
    console.log(`${index + 1}. ${file.name}`);
    console.log(`   Path: ${file.path}`);
    console.log(`   Modified: ${lastModified}`);
    
    if (file.snippet) {
      const snippet = file.snippet.replace(/\n/g, "\n   > ");
      console.log(`   Preview: ${snippet}`);
    }
    
    console.log();
  });
}

// ============================================================================
// Example 8: Recovering from crash
// ============================================================================

export async function recoverFromCrash(): Promise<string | null> {
  const storage = getStorageService();
  
  const buffer = await storage.loadEditorBuffer();
  
  if (!buffer) {
    console.log("No crash recovery data found");
    return null;
  }
  
  const timeSinceLastSave = Date.now() - buffer.timestamp;
  const minutesSince = Math.floor(timeSinceLastSave / (1000 * 60));
  
  console.log(
    `Recovery available: Last autosave was ${minutesSince} minutes ago`
  );
  console.log(`Content length: ${buffer.content.length} characters`);
  
  // Return recovered content
  return buffer.content;
}

// ============================================================================
// Example 9: Clearing specific data
// ============================================================================

export async function clearStorageData(what: "recent" | "buffer" | "all"): Promise<void> {
  const storage = getStorageService();
  
  switch (what) {
    case "recent":
      await storage.clearRecent();
      console.log("Cleared recent files");
      break;
      
    case "buffer":
      await storage.clearEditorBuffer();
      console.log("Cleared editor buffer");
      break;
      
    case "all":
      await storage.clearAll();
      console.log("Cleared all storage data");
      break;
  }
}

// ============================================================================
// Example 10: React Component using Storage
// ============================================================================

/*
"use client";

import { useEffect, useState } from "react";
import { getStorageService } from "@/lib/storage-service";
import type { StorageSession, RecentFile } from "@/lib/storage-types";

export function StorageExample() {
  const [session, setSession] = useState<StorageSession | null>(null);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storage = getStorageService();

    const loadData = async () => {
      try {
        const loadedSession = await storage.loadSession();
        setSession(loadedSession);

        const recent = await storage.getRecentFiles();
        setRecentFiles(recent);
      } catch (error) {
        console.error("Failed to load storage data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Storage Service Example</h1>

      {session?.appState.lastOpenedMdiPath && (
        <div>
          <h2>Last Opened File</h2>
          <p>{session.appState.lastOpenedMdiPath}</p>
        </div>
      )}

      {recentFiles.length > 0 && (
        <div>
          <h2>Recent Files</h2>
          <ul>
            {recentFiles.map((file) => (
              <li key={file.path}>
                <strong>{file.name}</strong>
                <p>{file.snippet?.substring(0, 50)}...</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {session?.editorBuffer && (
        <div>
          <h2>Unsaved Content</h2>
          <p>Last saved: {new Date(session.editorBuffer.timestamp).toLocaleString()}</p>
          <pre>{session.editorBuffer.content.substring(0, 200)}...</pre>
        </div>
      )}
    </div>
  );
}
*/

// ============================================================================
// Example 11: Complete session management flow
// ============================================================================

export class SessionManager {
  private storage = getStorageService();
  private autoSaveInterval: NodeJS.Timeout | null = null;
  private isDirty = false;
  private editorContent = "";

  async initialize(): Promise<void> {
    await this.storage.initialize();
  }

  async startup(): Promise<void> {
    // Load previous session
    const session = await this.storage.loadSession();

    if (session?.appState.lastOpenedMdiPath) {
      console.log(`Restoring: ${session.appState.lastOpenedMdiPath}`);
      // Load file...
    }

    if (session?.editorBuffer) {
      const restored = await this.requestRestoreBuffer(session.editorBuffer.content);
      if (restored) {
        this.editorContent = session.editorBuffer.content;
      }
    }

    // Start auto-save
    this.startAutoSave();
  }

  private async requestRestoreBuffer(content: string): Promise<boolean> {
    // In a real app, this would show a dialog
    console.log("Restore unsaved content? (Y/n)");
    return true; // Assume yes for this example
  }

  setEditorContent(content: string): void {
    this.editorContent = content;
    this.isDirty = true;
  }

  private startAutoSave(): void {
    this.autoSaveInterval = setInterval(async () => {
      if (this.isDirty) {
        await this.storage.saveEditorBuffer({
          content: this.editorContent,
          timestamp: Date.now(),
        });
        this.isDirty = false;
      }
    }, 30000);
  }

  async save(filePath: string, fileName: string): Promise<void> {
    // Save to file system
    // ...

    // Update storage
    await this.storage.addToRecent({
      name: fileName,
      path: filePath,
      lastModified: Date.now(),
      snippet: this.editorContent.substring(0, 100),
    });

    await this.storage.saveAppState({
      lastOpenedMdiPath: filePath,
    });

    // Clear buffer after successful save
    await this.storage.clearEditorBuffer();
    this.isDirty = false;
  }

  async shutdown(): Promise<void> {
    // Stop auto-save
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }

    // Save current state
    if (this.isDirty) {
      await this.storage.saveEditorBuffer({
        content: this.editorContent,
        timestamp: Date.now(),
      });
    }
  }
}

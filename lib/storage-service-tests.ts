/**
 * StorageService Test Suite
 * 
 * Demonstrates all storage operations and validates behavior.
 * Can be run to verify the storage system is working correctly.
 */

import type {
  IStorageService,
  StorageSession,
  RecentFile,
  AppState,
  EditorBuffer,
} from "@/lib/storage-types";
import { getStorageService } from "@/lib/storage-service";

/**
 * Test utilities
 */
const log = (message: string, data?: unknown) => {
  console.log(`[Storage Test] ${message}`, data ?? "");
};

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(`[Storage Test] Assertion failed: ${message}`);
  }
};

const assertEquals = (actual: unknown, expected: unknown, message: string) => {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message}\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`
  );
};

/**
 * Test Suite Class
 */
export class StorageServiceTestSuite {
  private storage: IStorageService;
  private testsPassed = 0;
  private testsFailed = 0;

  constructor() {
    this.storage = getStorageService();
  }

  /**
   * Run all tests
   */
  async runAll(): Promise<void> {
    log("Starting Storage Service Test Suite...");
    log(`Environment: ${typeof window !== "undefined" ? "Browser" : "Node.js"}`);

    try {
      await this.testInitialize();
      await this.testClearAll(); // Start fresh
      await this.testAppState();
      await this.testRecentFiles();
      await this.testEditorBuffer();
      await this.testSession();
      await this.testIntegration();

      this.printSummary();
    } catch (error) {
      log(`❌ Test suite error: ${error}`);
      throw error;
    }
  }

  /**
   * Test 1: Initialization
   */
  private async testInitialize(): Promise<void> {
    log("\n=== Test 1: Initialization ===");

    try {
      await this.storage.initialize();
      log("✅ Storage initialized successfully");
      this.testsPassed++;
    } catch (error) {
      log(`❌ Initialization failed: ${error}`);
      this.testsFailed++;
      throw error;
    }
  }

  /**
   * Test 2: App State Management
   */
  private async testAppState(): Promise<void> {
    log("\n=== Test 2: App State Management ===");

    try {
      // Test 2.1: Save app state
      const appState: AppState = {
        lastOpenedMdiPath: "/Users/test/documents/file.mdi",
      };

      await this.storage.saveAppState(appState);
      log("✅ App state saved");
      this.testsPassed++;

      // Test 2.2: Load app state
      const loaded = await this.storage.loadAppState();
      assertEquals(loaded, appState, "Loaded app state should match saved state");
      log("✅ App state loaded correctly");
      this.testsPassed++;

      // Test 2.3: Load non-existent state returns null
      await this.storage.clearAll();
      const empty = await this.storage.loadAppState();
      assert(empty === null, "Loading non-existent state should return null");
      log("✅ Non-existent app state returns null");
      this.testsPassed++;
    } catch (error) {
      log(`❌ App state test failed: ${error}`);
      this.testsFailed++;
    }
  }

  /**
   * Test 3: Recent Files Management
   */
  private async testRecentFiles(): Promise<void> {
    log("\n=== Test 3: Recent Files Management ===");

    try {
      await this.storage.clearRecent();

      // Test 3.1: Add single file
      const file1: RecentFile = {
        name: "Document1.mdi",
        path: "/path/to/Document1.mdi",
        lastModified: Date.now() - 1000,
        snippet: "This is the first document",
      };

      await this.storage.addToRecent(file1);
      let recent = await this.storage.getRecentFiles();
      assertEquals(recent.length, 1, "Should have 1 recent file");
      log("✅ Single file added");
      this.testsPassed++;

      // Test 3.2: Add multiple files
      const files = Array.from({ length: 5 }, (_, i) => ({
        name: `Document${i + 2}.mdi`,
        path: `/path/to/Document${i + 2}.mdi`,
        lastModified: Date.now() - i * 1000,
        snippet: `Document ${i + 2} content`,
      }));

      for (const file of files) {
        await this.storage.addToRecent(file);
      }

      recent = await this.storage.getRecentFiles();
      assertEquals(recent.length, 6, "Should have 6 recent files");
      log("✅ Multiple files added");
      this.testsPassed++;

      // Test 3.3: Test limit of 10 files
      for (let i = 6; i < 15; i++) {
        await this.storage.addToRecent({
          name: `Document${i + 1}.mdi`,
          path: `/path/to/Document${i + 1}.mdi`,
          lastModified: Date.now() - i * 1000,
          snippet: `Document ${i + 1}`,
        });
      }

      recent = await this.storage.getRecentFiles();
      assertEquals(recent.length, 10, "Should be limited to 10 recent files");
      log("✅ Recent files limited to 10");
      this.testsPassed++;

      // Test 3.4: Most recent file should be first
      const newest: RecentFile = {
        name: "NewestDocument.mdi",
        path: "/path/to/NewestDocument.mdi",
        lastModified: Date.now(),
        snippet: "Latest document",
      };

      await this.storage.addToRecent(newest);
      recent = await this.storage.getRecentFiles();
      assertEquals(recent[0].name, newest.name, "Newest file should be first");
      log("✅ Most recent file is first");
      this.testsPassed++;

      // Test 3.5: Update existing file (should move to front)
      const updated = { ...file1, lastModified: Date.now() + 10000 };
      await this.storage.addToRecent(updated);
      recent = await this.storage.getRecentFiles();
      assertEquals(recent[0].path, file1.path, "Updated file should be first");
      log("✅ Updated file moves to front");
      this.testsPassed++;

      // Test 3.6: Remove from recent
      await this.storage.removeFromRecent(file1.path);
      recent = await this.storage.getRecentFiles();
      const stillExists = recent.find((f) => f.path === file1.path);
      assert(!stillExists, "File should be removed from recent");
      log("✅ File removed from recent");
      this.testsPassed++;

      // Test 3.7: Clear all recent
      await this.storage.clearRecent();
      recent = await this.storage.getRecentFiles();
      assertEquals(recent.length, 0, "All recent files should be cleared");
      log("✅ All recent files cleared");
      this.testsPassed++;
    } catch (error) {
      log(`❌ Recent files test failed: ${error}`);
      this.testsFailed++;
    }
  }

  /**
   * Test 4: Editor Buffer Management
   */
  private async testEditorBuffer(): Promise<void> {
    log("\n=== Test 4: Editor Buffer Management ===");

    try {
      await this.storage.clearEditorBuffer();

      // Test 4.1: Save editor buffer
      const buffer: EditorBuffer = {
        content: "This is unsaved content from the editor",
        timestamp: Date.now(),
      };

      await this.storage.saveEditorBuffer(buffer);
      log("✅ Editor buffer saved");
      this.testsPassed++;

      // Test 4.2: Load editor buffer
      const loaded = await this.storage.loadEditorBuffer();
      assertEquals(loaded?.content, buffer.content, "Buffer content should match");
      assert(loaded?.timestamp === buffer.timestamp, "Buffer timestamp should match");
      log("✅ Editor buffer loaded correctly");
      this.testsPassed++;

      // Test 4.3: Load non-existent buffer returns null
      await this.storage.clearEditorBuffer();
      const empty = await this.storage.loadEditorBuffer();
      assert(empty === null, "Non-existent buffer should return null");
      log("✅ Non-existent buffer returns null");
      this.testsPassed++;

      // Test 4.4: Large content handling
      const largeContent = "x".repeat(100000); // 100KB
      const largeBuffer: EditorBuffer = {
        content: largeContent,
        timestamp: Date.now(),
      };

      await this.storage.saveEditorBuffer(largeBuffer);
      const loadedLarge = await this.storage.loadEditorBuffer();
      assertEquals(loadedLarge?.content.length, largeContent.length, "Large content should be preserved");
      log("✅ Large content handled correctly");
      this.testsPassed++;
    } catch (error) {
      log(`❌ Editor buffer test failed: ${error}`);
      this.testsFailed++;
    }
  }

  /**
   * Test 5: Complete Session Management
   */
  private async testSession(): Promise<void> {
    log("\n=== Test 5: Complete Session Management ===");

    try {
      await this.storage.clearAll();

      // Test 5.1: Save complete session
      const session: StorageSession = {
        appState: {
          lastOpenedMdiPath: "/path/to/file.mdi",
        },
        recentFiles: [
          {
            name: "Recent1.mdi",
            path: "/path/to/Recent1.mdi",
            lastModified: Date.now() - 5000,
            snippet: "Recent file 1",
          },
          {
            name: "Recent2.mdi",
            path: "/path/to/Recent2.mdi",
            lastModified: Date.now() - 10000,
            snippet: "Recent file 2",
          },
        ],
        editorBuffer: {
          content: "Unsaved work...",
          timestamp: Date.now(),
        },
      };

      await this.storage.saveSession(session);
      log("✅ Session saved");
      this.testsPassed++;

      // Test 5.2: Load complete session
      const loaded = await this.storage.loadSession();
      assert(loaded !== null, "Session should be loaded");
      assertEquals(loaded?.appState.lastOpenedMdiPath, session.appState.lastOpenedMdiPath, "App state should match");
      assertEquals(loaded?.recentFiles.length, 2, "Should have 2 recent files");
      assertEquals(loaded?.editorBuffer?.content, session.editorBuffer?.content, "Buffer content should match");
      log("✅ Session loaded correctly");
      this.testsPassed++;

      // Test 5.3: Load non-existent session returns null
      await this.storage.clearAll();
      const empty = await this.storage.loadSession();
      assert(empty === null, "Non-existent session should return null");
      log("✅ Non-existent session returns null");
      this.testsPassed++;

      // Test 5.4: Session without editor buffer
      const sessionNoBuffer: StorageSession = {
        appState: { lastOpenedMdiPath: "/path/to/file.mdi" },
        recentFiles: [],
        editorBuffer: null,
      };

      await this.storage.saveSession(sessionNoBuffer);
      const loadedNoBuffer = await this.storage.loadSession();
      assertEquals(loadedNoBuffer?.editorBuffer, null, "Editor buffer should be null");
      log("✅ Session without buffer handled correctly");
      this.testsPassed++;
    } catch (error) {
      log(`❌ Session test failed: ${error}`);
      this.testsFailed++;
    }
  }

  /**
   * Test 6: Integration Scenarios
   */
  private async testIntegration(): Promise<void> {
    log("\n=== Test 6: Integration Scenarios ===");

    try {
      await this.storage.clearAll();

      // Scenario 1: Typical app lifecycle
      log("\nScenario 1: Typical app lifecycle");

      // 1. Startup - no previous session
      let session = await this.storage.loadSession();
      assert(session === null, "First startup should have no session");
      log("✅ Empty startup");

      // 2. User opens first file
      const filePath = "/Users/test/first.mdi";
      await this.storage.saveAppState({ lastOpenedMdiPath: filePath });
      await this.storage.addToRecent({
        name: "first.mdi",
        path: filePath,
        lastModified: Date.now(),
      });
      log("✅ First file opened and added to recent");

      // 3. User works on file with auto-save
      for (let i = 0; i < 3; i++) {
        await this.storage.saveEditorBuffer({
          content: `Work iteration ${i}...`,
          timestamp: Date.now() + i * 10000,
        });
      }
      log("✅ Auto-save iterations completed");

      // 4. Session restore on next startup
      session = await this.storage.loadSession();
      assert(session !== null, "Session should be available");
      assertEquals(session?.appState.lastOpenedMdiPath, filePath, "Should restore last file");
      assert(session?.editorBuffer !== null, "Should have recovered buffer");
      log("✅ Session restored on next startup");

      // 5. User saves file
      await this.storage.clearEditorBuffer(); // Clear after save
      log("✅ Buffer cleared after save");

      // Scenario 2: Multiple recent files with collision
      log("\nScenario 2: Multiple recent files with collision");

      const files = [
        { name: "a.mdi", path: "/a.mdi" },
        { name: "b.mdi", path: "/b.mdi" },
        { name: "c.mdi", path: "/c.mdi" },
      ];

      for (const file of files) {
        await this.storage.addToRecent({
          name: file.name,
          path: file.path,
          lastModified: Date.now(),
        });
        // Delay to ensure different timestamps
        await new Promise((r) => setTimeout(r, 10));
      }

      let recent = await this.storage.getRecentFiles();
      const lastFile = recent[0];
      log(`✅ Most recent file is: ${lastFile.name}`);

      // Re-open oldest file (should move to front)
      await this.storage.addToRecent({
        name: files[0].name,
        path: files[0].path,
        lastModified: Date.now() + 5000,
      });

      recent = await this.storage.getRecentFiles();
      assertEquals(recent[0].path, files[0].path, "Re-opened file should be first");
      log("✅ Re-opened file correctly positioned");

      this.testsPassed++;
    } catch (error) {
      log(`❌ Integration test failed: ${error}`);
      this.testsFailed++;
    }
  }

  /**
   * Print test summary
   */
  private printSummary(): void {
    const total = this.testsPassed + this.testsFailed;
    const percentage =
      total > 0 ? Math.round((this.testsPassed / total) * 100) : 0;

    log(
      `\n${"=".repeat(50)}\nTest Summary\n${"=".repeat(50)}`
    );
    log(`✅ Passed: ${this.testsPassed}`);
    log(`❌ Failed: ${this.testsFailed}`);
    log(`📊 Total:  ${total}`);
    log(`📈 Pass Rate: ${percentage}%\n`);

    if (this.testsFailed === 0) {
      log("🎉 All tests passed!");
    }
  }
}

/**
 * Run tests if imported directly
 */
if (typeof window !== "undefined") {
  // Browser environment - expose for manual testing
  (window as any).runStorageTests = async () => {
    const suite = new StorageServiceTestSuite();
    await suite.runAll();
  };

  // Log how to run
  console.log(
    "[Storage Tests] Run: window.runStorageTests() to execute all tests"
  );
}

export default StorageServiceTestSuite;

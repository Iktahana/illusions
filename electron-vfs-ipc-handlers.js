/* eslint-disable no-console */
/**
 * VFS IPC handlers for Electron
 * Provides file system operations for the renderer process
 */

const { ipcMain, dialog, app } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

function registerVFSHandlers() {
  // Track the opened root directory per window for path validation
  const allowedRoots = new Map();

  // Track paths that were selected via the native file dialog
  const dialogApprovedPaths = new Set();

  /**
   * Normalize path separators to forward slashes for cross-platform compatibility.
   * This ensures Windows backslashes (\) and Unix forward slashes (/) are handled consistently.
   */
  function normalizePath(p) {
    // Replace all backslashes with forward slashes and remove trailing slashes
    return p.replace(/\\/g, '/').replace(/\/+$/, '');
  }

  /**
   * Validate that a requested path is within the allowed root directory.
   * Prevents path traversal attacks from a compromised renderer.
   * @param {Electron.IpcMainInvokeEvent} event - The IPC event to identify the sender window
   * @param {string} requestedPath - The path to validate
   */
  function validateVFSPath(event, requestedPath) {
    const allowedRoot = allowedRoots.get(event.sender.id);
    if (!allowedRoot) {
      throw new Error('ディレクトリが開かれていません');
    }
    const resolved = path.resolve(requestedPath);

    // Normalize paths for consistent comparison across platforms
    const normalizedResolved = normalizePath(resolved);
    const normalizedRoot = normalizePath(allowedRoot);

    if (normalizedResolved !== normalizedRoot && !normalizedResolved.startsWith(normalizedRoot + '/')) {
      throw new Error('プロジェクトディレクトリの外部へのアクセスは許可されていません');
    }
    return resolved;
  }

  // Open directory picker
  ipcMain.handle('vfs:open-directory', async (event) => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || !result.filePaths[0]) {
      return null;
    }

    const dirPath = result.filePaths[0];
    const name = path.basename(dirPath);

    // Update the allowed root for this window
    allowedRoots.set(event.sender.id, dirPath);
    dialogApprovedPaths.add(dirPath);

    return {
      path: dirPath,
      name,
    };
  });

  // Read file content
  ipcMain.handle('vfs:read-file', async (event, filePath) => {
    try {
      const resolved = validateVFSPath(event, filePath);
      return await fs.readFile(resolved, 'utf-8');
    } catch (error) {
      console.error('[VFS IPC] readFile failed:', error);
      throw error;
    }
  });

  // Write file content
  ipcMain.handle('vfs:write-file', async (event, filePath, content) => {
    try {
      const resolved = validateVFSPath(event, filePath);
      // Use open -> write -> sync -> close pattern for better compatibility with virtual file systems (e.g., Google Drive on Windows)
      const fileHandle = await fs.open(resolved, 'w');
      try {
        await fileHandle.writeFile(content, 'utf-8');
        // Explicitly sync to ensure data is flushed to disk (critical for Windows network drives)
        await fileHandle.sync();
      } finally {
        await fileHandle.close();
      }
    } catch (error) {
      console.error('[VFS IPC] writeFile failed:', error);
      console.error('[VFS IPC] Error details:', {
        message: error.message,
        code: error.code,
        syscall: error.syscall,
        path: filePath,
      });
      throw error;
    }
  });

  // Read directory entries
  ipcMain.handle('vfs:read-directory', async (event, dirPath) => {
    try {
      const resolved = validateVFSPath(event, dirPath);
      const entries = await fs.readdir(resolved, { withFileTypes: true });
      return entries.map((entry) => ({
        name: entry.name,
        kind: entry.isDirectory() ? 'directory' : 'file',
      }));
    } catch (error) {
      console.error('[VFS IPC] readDirectory failed:', error);
      throw error;
    }
  });

  // Get file stats
  ipcMain.handle('vfs:stat', async (event, filePath) => {
    try {
      const resolved = validateVFSPath(event, filePath);
      const stats = await fs.stat(resolved);
      return {
        size: stats.size,
        lastModified: stats.mtimeMs,
        type: stats.isDirectory() ? 'directory' : 'text/plain',
      };
    } catch (error) {
      console.error('[VFS IPC] stat failed:', error);
      throw error;
    }
  });

  // Create directory (with parents)
  ipcMain.handle('vfs:mkdir', async (event, dirPath) => {
    try {
      const resolved = validateVFSPath(event, dirPath);
      await fs.mkdir(resolved, { recursive: true });
    } catch (error) {
      console.error('[VFS IPC] mkdir failed:', error);
      throw error;
    }
  });

  // Delete file or directory
  ipcMain.handle('vfs:delete', async (event, targetPath, options = {}) => {
    try {
      const resolved = validateVFSPath(event, targetPath);
      const stats = await fs.stat(resolved);
      if (stats.isDirectory()) {
        await fs.rm(resolved, { recursive: options.recursive || false });
      } else {
        await fs.unlink(resolved);
      }
    } catch (error) {
      console.error('[VFS IPC] delete failed:', error);
      throw error;
    }
  });

  // Rename file or directory
  ipcMain.handle('vfs:rename', async (event, oldPath, newPath) => {
    try {
      const resolvedOld = validateVFSPath(event, oldPath);
      const resolvedNew = validateVFSPath(event, newPath);
      await fs.rename(resolvedOld, resolvedNew);
    } catch (error) {
      console.error('[VFS IPC] rename failed:', error);
      throw error;
    }
  });

  /**
   * Check if a path is in the system-sensitive denylist.
   * Prevents access to critical system directories and credential stores.
   *
   * @param {string} normalizedPath - Forward-slash normalized absolute path
   * @returns {boolean} true if the path should be denied
   */
  function isDeniedPath(normalizedPath) {
    const homedir = normalizePath(os.homedir());

    // System root directories (Unix + macOS + Windows)
    const denyExact = new Set([
      '/', '/etc', '/usr', '/bin', '/sbin', '/var', '/tmp', '/System',
      '/private', '/private/etc', '/private/var',
    ]);

    // Add Windows drive roots and system directories
    const driveLetterMatch = normalizedPath.match(/^([a-zA-Z]):?\/?$/);
    if (driveLetterMatch) return true; // Bare drive root (C:/ or C:)

    const windowsDenyPrefixes = [
      'C:/Windows', 'C:/Program Files', 'C:/Program Files (x86)',
    ];

    // Sensitive directories within home
    const homeSensitiveSuffixes = [
      '/.ssh', '/.gnupg', '/.aws', '/.kube', '/.docker',
      '/.config/gcloud', '/Library/Keychains',
    ];

    if (denyExact.has(normalizedPath)) return true;
    if (normalizedPath === homedir) return true;
    if (windowsDenyPrefixes.some(p => normalizedPath.toLowerCase().startsWith(p.toLowerCase()))) return true;
    if (homeSensitiveSuffixes.some(s => normalizedPath.startsWith(homedir + s))) return true;

    return false;
  }

  // Set root directory programmatically (for restoring a recent project without dialog)
  ipcMain.handle('vfs:set-root', async (event, rootPath) => {
    const resolved = path.resolve(rootPath);
    const normalizedResolved = normalizePath(resolved);

    // 1. Deny system-sensitive paths
    if (isDeniedPath(normalizedResolved)) {
      throw new Error('セキュリティ上の理由により、このディレクトリへのアクセスは制限されています');
    }

    // 2. Verify the path actually exists and is a directory
    try {
      const stats = await fs.stat(resolved);
      if (!stats.isDirectory()) {
        throw new Error('指定されたパスはディレクトリではありません');
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error('指定されたディレクトリが見つかりません');
      }
      throw error;
    }

    // 3. Allow if path is dialog-approved or child of a dialog-approved path
    const isDialogApproved = [...dialogApprovedPaths].some(approved => {
      const normalizedApproved = normalizePath(approved);
      return normalizedResolved === normalizedApproved
        || normalizedResolved.startsWith(normalizedApproved + '/');
    });

    // 4. Allow if path is within user's home directory (for session restore, double-click open)
    const normalizedHome = normalizePath(os.homedir());
    const isUnderHome = normalizedResolved.startsWith(normalizedHome + '/');

    if (!isDialogApproved && !isUnderHome) {
      throw new Error('セキュリティ上の理由により、ホームディレクトリ外のパスには直接アクセスできません');
    }

    allowedRoots.set(event.sender.id, resolved);
    return { path: resolved, name: path.basename(resolved) };
  });

  // Clean up allowedRoots when a window is destroyed to prevent memory leaks
  app.on('web-contents-created', (_, contents) => {
    contents.on('destroyed', () => {
      allowedRoots.delete(contents.id);
    });
  });

  console.log('[VFS IPC] VFS handlers registered');
}

module.exports = { registerVFSHandlers };

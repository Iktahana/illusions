/* eslint-disable no-console */
/**
 * VFS IPC handlers for Electron
 * Provides file system operations for the renderer process
 */

const { ipcMain, dialog } = require('electron');
const fs = require('fs/promises');
const path = require('path');

function registerVFSHandlers() {
  // Track the currently opened root directory for path validation
  let allowedRoot = null;

  /**
   * Validate that a requested path is within the allowed root directory.
   * Prevents path traversal attacks from a compromised renderer.
   */
  function validateVFSPath(requestedPath) {
    if (!allowedRoot) {
      throw new Error('ディレクトリが開かれていません');
    }
    const resolved = path.resolve(requestedPath);
    if (resolved !== allowedRoot && !resolved.startsWith(allowedRoot + path.sep)) {
      throw new Error('プロジェクトディレクトリの外部へのアクセスは許可されていません');
    }
    return resolved;
  }

  // Open directory picker
  ipcMain.handle('vfs:open-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || !result.filePaths[0]) {
      return null;
    }

    const dirPath = result.filePaths[0];
    const name = path.basename(dirPath);

    // Update the allowed root for subsequent operations
    allowedRoot = dirPath;

    return {
      path: dirPath,
      name,
    };
  });

  // Read file content
  ipcMain.handle('vfs:read-file', async (_event, filePath) => {
    try {
      const resolved = validateVFSPath(filePath);
      return await fs.readFile(resolved, 'utf-8');
    } catch (error) {
      console.error('[VFS IPC] readFile failed:', error);
      throw error;
    }
  });

  // Write file content
  ipcMain.handle('vfs:write-file', async (_event, filePath, content) => {
    try {
      const resolved = validateVFSPath(filePath);
      await fs.writeFile(resolved, content, 'utf-8');
    } catch (error) {
      console.error('[VFS IPC] writeFile failed:', error);
      throw error;
    }
  });

  // Read directory entries
  ipcMain.handle('vfs:read-directory', async (_event, dirPath) => {
    try {
      const resolved = validateVFSPath(dirPath);
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
  ipcMain.handle('vfs:stat', async (_event, filePath) => {
    try {
      const resolved = validateVFSPath(filePath);
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
  ipcMain.handle('vfs:mkdir', async (_event, dirPath) => {
    try {
      const resolved = validateVFSPath(dirPath);
      await fs.mkdir(resolved, { recursive: true });
    } catch (error) {
      console.error('[VFS IPC] mkdir failed:', error);
      throw error;
    }
  });

  // Delete file or directory
  ipcMain.handle('vfs:delete', async (_event, targetPath, options = {}) => {
    try {
      const resolved = validateVFSPath(targetPath);
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
  ipcMain.handle('vfs:rename', async (_event, oldPath, newPath) => {
    try {
      const resolvedOld = validateVFSPath(oldPath);
      const resolvedNew = validateVFSPath(newPath);
      await fs.rename(resolvedOld, resolvedNew);
    } catch (error) {
      console.error('[VFS IPC] rename failed:', error);
      throw error;
    }
  });

  // Set root directory programmatically (for restoring a recent project without dialog)
  ipcMain.handle('vfs:set-root', async (_event, rootPath) => {
    const resolved = path.resolve(rootPath);
    allowedRoot = resolved;
    return { path: resolved, name: path.basename(resolved) };
  });

  console.log('[VFS IPC] VFS handlers registered');
}

module.exports = { registerVFSHandlers };

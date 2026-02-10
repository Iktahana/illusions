/* eslint-disable no-console */
/**
 * VFS IPC handlers for Electron
 * Provides file system operations for the renderer process
 */

const { ipcMain, dialog } = require('electron');
const fs = require('fs/promises');
const path = require('path');

function registerVFSHandlers() {
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

    return {
      path: dirPath,
      name,
    };
  });

  // Read file content
  ipcMain.handle('vfs:read-file', async (_event, filePath) => {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      console.error('[VFS IPC] readFile failed:', error);
      throw error;
    }
  });

  // Write file content
  ipcMain.handle('vfs:write-file', async (_event, filePath, content) => {
    try {
      await fs.writeFile(filePath, content, 'utf-8');
    } catch (error) {
      console.error('[VFS IPC] writeFile failed:', error);
      throw error;
    }
  });

  // Read directory entries
  ipcMain.handle('vfs:read-directory', async (_event, dirPath) => {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
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
      const stats = await fs.stat(filePath);
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
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      console.error('[VFS IPC] mkdir failed:', error);
      throw error;
    }
  });

  // Delete file or directory
  ipcMain.handle('vfs:delete', async (_event, targetPath, options = {}) => {
    try {
      const stats = await fs.stat(targetPath);
      if (stats.isDirectory()) {
        await fs.rm(targetPath, { recursive: options.recursive || false });
      } else {
        await fs.unlink(targetPath);
      }
    } catch (error) {
      console.error('[VFS IPC] delete failed:', error);
      throw error;
    }
  });

  console.log('[VFS IPC] VFS handlers registered');
}

module.exports = { registerVFSHandlers };

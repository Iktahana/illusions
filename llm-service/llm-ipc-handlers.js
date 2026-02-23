// @ts-check
'use strict';

const { ipcMain } = require('electron');
const { LlmEngine } = require('./llm-engine');

/** @type {LlmEngine | null} */
let llmEngine = null;

async function ensureInit() {
  if (!llmEngine) {
    llmEngine = new LlmEngine();
    await llmEngine.init();
  }
}

function registerLlmHandlers() {
  ipcMain.handle('llm:get-models', async () => {
    await ensureInit();
    return llmEngine.getModels();
  });

  ipcMain.handle('llm:download-model', async (event, modelId) => {
    if (typeof modelId !== 'string' || modelId.length === 0) {
      throw new Error('Invalid modelId parameter');
    }
    await ensureInit();
    await llmEngine.downloadModel(modelId, (progress) => {
      event.sender.send('llm:download-progress', progress);
    });
  });

  ipcMain.handle('llm:delete-model', async (_event, modelId) => {
    if (typeof modelId !== 'string' || modelId.length === 0) {
      throw new Error('Invalid modelId parameter');
    }
    await ensureInit();
    await llmEngine.deleteModel(modelId);
  });

  ipcMain.handle('llm:load-model', async (_event, modelId) => {
    if (typeof modelId !== 'string' || modelId.length === 0) {
      throw new Error('Invalid modelId parameter');
    }
    await ensureInit();
    await llmEngine.loadModel(modelId);
  });

  ipcMain.handle('llm:unload-model', async () => {
    await ensureInit();
    await llmEngine.unloadModel();
  });

  ipcMain.handle('llm:is-model-loaded', async () => {
    await ensureInit();
    return llmEngine.isLoaded();
  });

  ipcMain.handle('llm:infer', async (_event, params) => {
    if (!params || typeof params.prompt !== 'string') {
      throw new Error('Invalid prompt parameter');
    }
    if (params.prompt.length > 100_000) {
      throw new Error('Prompt too long (max 100,000 characters)');
    }
    await ensureInit();
    return llmEngine.infer(params.prompt, {
      maxTokens: typeof params.maxTokens === 'number' ? params.maxTokens : undefined,
    });
  });

  ipcMain.handle('llm:get-storage-usage', async () => {
    await ensureInit();
    return llmEngine.getStorageUsage();
  });

  ipcMain.handle('llm:set-idling-stop', async (_event, { enabled }) => {
    await ensureInit();
    llmEngine.setIdlingStop(Boolean(enabled));
  });
}

async function disposeLlmEngine() {
  if (llmEngine) {
    await llmEngine.dispose();
    llmEngine = null;
  }
}

module.exports = { registerLlmHandlers, disposeLlmEngine };

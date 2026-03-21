// @ts-check
'use strict';

/**
 * LLM IPC Handlers — Cloud API key management
 *
 * Handles secure storage and retrieval of cloud AI provider configuration.
 * API keys are encrypted at rest via Electron safeStorage (OS keychain).
 *
 * Channels:
 *   llm:save-provider-config  — encrypt and persist provider config
 *   llm:load-provider-config  — decrypt and return provider config
 *   llm:delete-provider-config — remove stored config
 */

const path = require('path');
const fs = require('fs/promises');
const { ipcMain, safeStorage, app } = require('electron');

const VALID_PROVIDERS = ['openai', 'anthropic', 'google'];
const CONFIG_FILE_NAME = 'llm-provider-config.json';

/** @returns {string} Path to the encrypted config file */
function getConfigFilePath() {
  return path.join(app.getPath('userData'), CONFIG_FILE_NAME);
}

/**
 * Persist provider config with the API key encrypted via safeStorage.
 * @param {{ provider: string; model: string; apiKey: string }} config
 */
async function saveProviderConfig(config) {
  const configPath = getConfigFilePath();

  let encryptedKey = null;
  if (safeStorage.isEncryptionAvailable()) {
    const buf = safeStorage.encryptString(config.apiKey);
    encryptedKey = buf.toString('base64');
  } else {
    // Fallback: store plain (not recommended, but better than losing the config)
    encryptedKey = Buffer.from(config.apiKey).toString('base64');
  }

  const stored = {
    provider: config.provider,
    model: config.model,
    encryptedKey,
    encrypted: safeStorage.isEncryptionAvailable(),
  };

  await fs.writeFile(configPath, JSON.stringify(stored, null, 2), 'utf8');
}

/**
 * Load and decrypt the provider config.
 * Returns null if not found.
 * @returns {Promise<{ provider: string; model: string; apiKey: string } | null>}
 */
async function loadProviderConfig() {
  const configPath = getConfigFilePath();

  let raw;
  try {
    raw = await fs.readFile(configPath, 'utf8');
  } catch {
    return null;
  }

  let stored;
  try {
    stored = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!stored || typeof stored.provider !== 'string' || typeof stored.encryptedKey !== 'string') {
    return null;
  }

  let apiKey;
  try {
    if (stored.encrypted && safeStorage.isEncryptionAvailable()) {
      const buf = Buffer.from(stored.encryptedKey, 'base64');
      apiKey = safeStorage.decryptString(buf);
    } else {
      apiKey = Buffer.from(stored.encryptedKey, 'base64').toString('utf8');
    }
  } catch {
    return null;
  }

  return {
    provider: stored.provider,
    model: stored.model ?? '',
    apiKey,
  };
}

/** Delete the stored config file */
async function deleteProviderConfig() {
  const configPath = getConfigFilePath();
  try {
    await fs.unlink(configPath);
  } catch {
    // File may not exist — ignore
  }
}

function registerLlmHandlers() {
  ipcMain.handle('llm:save-provider-config', async (_event, config) => {
    if (
      !config ||
      typeof config.provider !== 'string' ||
      !VALID_PROVIDERS.includes(config.provider) ||
      typeof config.model !== 'string' ||
      config.model.length === 0 ||
      typeof config.apiKey !== 'string' ||
      config.apiKey.length === 0
    ) {
      throw new Error('プロバイダー設定が無効です。provider、model、apiKey をすべて指定してください。');
    }
    await saveProviderConfig(config);
  });

  ipcMain.handle('llm:load-provider-config', async () => {
    return loadProviderConfig();
  });

  ipcMain.handle('llm:delete-provider-config', async () => {
    await deleteProviderConfig();
  });
}

function disposeLlmEngine() {
  // No local engine to dispose — no-op
}

module.exports = { registerLlmHandlers, disposeLlmEngine };

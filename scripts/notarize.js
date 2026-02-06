const { notarize } = require('@electron/notarize');

/**
 * Retry notarization with exponential backoff
 * 
 * @param {Object} options - Notarization options
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise<void>}
 */
async function notarizeWithRetry(options, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Notarize] Attempt ${attempt}/${maxRetries}...`);
      await notarize(options);
      console.log('[Notarize] ✅ Notarization successful!');
      return;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      
      // Check if error is network-related (retryable)
      const isNetworkError = 
        error.message?.includes('ENOTFOUND') ||
        error.message?.includes('ETIMEDOUT') ||
        error.message?.includes('ECONNREFUSED') ||
        error.message?.includes('connection appears to be offline') ||
        error.message?.includes('Code=-1009');
      
      if (!isNetworkError) {
        // Non-network errors (auth, validation, etc.) should fail immediately
        console.error('[Notarize] ❌ Non-retryable error:', error.message);
        throw error;
      }
      
      if (isLastAttempt) {
        console.error(`[Notarize] ❌ Failed after ${maxRetries} attempts`);
        throw error;
      }
      
      // Exponential backoff: 30s, 60s, 120s
      const delaySeconds = Math.pow(2, attempt - 1) * 30;
      console.warn(`[Notarize] ⚠️  Network error (attempt ${attempt}):`, error.message);
      console.log(`[Notarize] 🔄 Retrying in ${delaySeconds} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
    }
  }
}

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  const appleId = process.env.APPLE_ID;
  const appleIdPassword =
    process.env.APPLE_APP_SPECIFIC_PASSWORD || process.env.APPLE_ID_PASSWORD;
  const teamId = process.env.TEAM_ID || process.env.APPLE_TEAM_ID;

  if (!appleId || !appleIdPassword || !teamId) {
    throw new Error(
      'Missing notarization env: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, or TEAM_ID/APPLE_TEAM_ID'
    );
  }

  console.log(`[Notarize] 📝 Starting notarization for ${appPath}`);

  await notarizeWithRetry(
    {
      appPath,
      appleId,
      appleIdPassword,
      teamId,
    },
    3 // Max 3 attempts
  );
};

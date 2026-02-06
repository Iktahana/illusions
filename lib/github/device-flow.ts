/**
 * GitHub Device Flow Authentication
 * 
 * Implements OAuth Device Flow for desktop/browser applications.
 * This flow is ideal for apps that can't use a web redirect.
 * 
 * Flow:
 * 1. Request device code from GitHub
 * 2. Show user code to user
 * 3. User visits verification URL and enters code
 * 4. Poll GitHub for access token
 * 5. Receive access token when user completes authorization
 */

import type { DeviceCodeResponse, AccessTokenResponse } from "./types";

// Use Next.js API routes to proxy GitHub requests (avoids CORS issues in browser)
const DEVICE_CODE_URL = "/api/github/device-code";
const ACCESS_TOKEN_URL = "/api/github/access-token";

export class GitHubDeviceFlow {
  constructor() {
    // Client ID is now handled by the API routes
  }

  /**
   * Step 1: Request a device code and user code from GitHub.
   * 
   * @returns Device code response with user code and verification URI
   * @throws Error if the request fails
   */
  async requestDeviceCode(): Promise<DeviceCodeResponse> {
    const response = await fetch(DEVICE_CODE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to request device code: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  }

  /**
   * Step 2: Poll GitHub for access token.
   * This should be called repeatedly with the device code until:
   * - User authorizes (returns access token)
   * - Authorization expires
   * - User denies
   * 
   * @param deviceCode - The device code from requestDeviceCode()
   * @param interval - Polling interval in seconds (from device code response)
   * @returns Access token when authorization succeeds
   * @throws Error if authorization fails, expires, or is denied
   */
  async pollForAccessToken(
    deviceCode: string,
    interval: number = 5
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const response = await fetch(ACCESS_TOKEN_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              device_code: deviceCode,
            }),
          });

          const data = await response.json();

          if (data.error) {
            switch (data.error) {
              case "authorization_pending":
                // User hasn't authorized yet, continue polling
                setTimeout(poll, interval * 1000);
                break;
              case "slow_down":
                // We're polling too fast, increase interval
                setTimeout(poll, (interval + 5) * 1000);
                break;
              case "expired_token":
                reject(new Error("デバイスコードの有効期限が切れました。もう一度お試しください。"));
                break;
              case "access_denied":
                reject(new Error("アクセスが拒否されました。"));
                break;
              default:
                reject(new Error(`認証エラー: ${data.error_description || data.error}`));
            }
          } else if (data.access_token) {
            // Success!
            resolve(data.access_token);
          } else {
            reject(new Error("予期しないレスポンス形式"));
          }
        } catch (error) {
          reject(error);
        }
      };

      // Start polling
      poll();
    });
  }

  /**
   * Complete device flow authentication.
   * This is a convenience method that combines requestDeviceCode and pollForAccessToken.
   * 
   * @param onDeviceCode - Callback to display user code to the user
   * @returns Access token when authorization succeeds
   */
  async authenticate(
    onDeviceCode: (response: DeviceCodeResponse) => void
  ): Promise<string> {
    // Step 1: Get device code
    const deviceCodeResponse = await this.requestDeviceCode();
    
    // Step 2: Show user code to user
    onDeviceCode(deviceCodeResponse);
    
    // Step 3: Poll for access token
    const accessToken = await this.pollForAccessToken(
      deviceCodeResponse.device_code,
      deviceCodeResponse.interval
    );
    
    return accessToken;
  }
}

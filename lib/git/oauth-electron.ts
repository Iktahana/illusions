/**
 * Electron OAuth Implementation
 * 
 * GitHub OAuth using custom protocol handler (illusions://)
 * Handles authorization code flow with PKCE for security.
 */

import { GitAuthResult, GitHubUser } from './git-storage-types';
import { getTokenStorage } from './token-storage';

/**
 * Electron OAuth service
 */
export class ElectronOAuthService {
  private readonly clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID || '';
  private readonly clientSecret = process.env.GITHUB_CLIENT_SECRET || '';
  private readonly redirectUri = 'illusions://github-callback';
  private readonly scope = 'repo user:email';
  
  private oauthState: string = '';
  private oauthCodeVerifier: string = '';

  constructor() {
    if (!this.clientId) {
      console.warn('GitHub Client ID not configured');
    }
  }

  /**
   * Generate a random string for PKCE code_verifier
   */
  private generateCodeVerifier(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let verifier = '';
    for (let i = 0; i < 128; i++) {
      verifier += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return verifier;
  }

  /**
   * Generate SHA256 hash for PKCE code_challenge
   */
  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashBase64 = btoa(String.fromCharCode(...hashArray));
    return hashBase64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  /**
   * Generate random state for CSRF protection
   */
  private generateState(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let state = '';
    for (let i = 0; i < 32; i++) {
      state += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return state;
  }

  /**
   * Start OAuth flow - opens browser to GitHub authorization
   */
  async initiateLogin(): Promise<void> {
    if (!this.clientId) {
      throw new Error('GitHub Client ID not configured');
    }

    this.oauthState = this.generateState();
    this.oauthCodeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(this.oauthCodeVerifier);

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: this.scope,
      state: this.oauthState,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      allow_signup: 'true',
    });

    const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;

    // In Electron context, use the API to open the URL
    if (typeof window !== 'undefined' && (window as any).electronAPI?.openUrl) {
      await (window as any).electronAPI.openUrl(authUrl);
    } else {
      // Fallback for web/non-Electron
      window.open(authUrl, '_blank');
    }
  }

  /**
   * Handle OAuth callback from custom protocol
   * Called when user completes GitHub authorization
   */
  async handleCallback(code: string, state: string): Promise<GitAuthResult> {
    // Verify state to prevent CSRF
    if (state !== this.oauthState) {
      return {
        success: false,
        error: 'Invalid state parameter - CSRF attack detected',
      };
    }

    try {
      // Exchange code for access token (needs to be done on backend)
      const tokenResponse = await this.exchangeCodeForToken(code);

      if (!tokenResponse.access_token) {
        return {
          success: false,
          error: 'Failed to obtain access token',
        };
      }

      // Save token
      const tokenStorage = getTokenStorage();
      await tokenStorage.saveToken(tokenResponse.access_token);

      // Fetch user information
      const user = await this.fetchUserInfo(tokenResponse.access_token);

      return {
        success: true,
        user,
        token: tokenResponse.access_token,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Authentication failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Exchange authorization code for access token
   * This should ideally be done on a backend server for security
   */
  private async exchangeCodeForToken(code: string): Promise<{ access_token: string; token_type: string }> {
    // In production, this should be done on your backend server
    // For now, we'll attempt a direct call, but this exposes the client secret

    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.redirectUri,
        code_verifier: this.oauthCodeVerifier,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Fetch current user information from GitHub API
   */
  private async fetchUserInfo(token: string): Promise<GitHubUser> {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch user info: ${response.statusText}`);
    }

    const user = await response.json();
    return {
      id: user.id,
      login: user.login,
      name: user.name || user.login,
      avatar_url: user.avatar_url,
      email: user.email,
    };
  }

  /**
   * Get current user from stored token
   */
  async getCurrentUser(): Promise<GitHubUser | null> {
    const tokenStorage = getTokenStorage();
    const token = await tokenStorage.getToken();

    if (!token) {
      return null;
    }

    try {
      return await this.fetchUserInfo(token);
    } catch (error) {
      console.error('Failed to fetch current user:', error);
      return null;
    }
  }

  /**
   * Logout and clear token
   */
  async logout(): Promise<void> {
    const tokenStorage = getTokenStorage();
    await tokenStorage.clearToken();
    this.oauthState = '';
    this.oauthCodeVerifier = '';
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const tokenStorage = getTokenStorage();
    const token = await tokenStorage.getToken();
    return !!token;
  }

  /**
   * Get current access token
   */
  async getAccessToken(): Promise<string | null> {
    const tokenStorage = getTokenStorage();
    return tokenStorage.getToken();
  }
}

/**
 * Singleton instance
 */
let electronOAuthInstance: ElectronOAuthService | null = null;

export function getElectronOAuth(): ElectronOAuthService {
  if (!electronOAuthInstance) {
    electronOAuthInstance = new ElectronOAuthService();
  }
  return electronOAuthInstance;
}

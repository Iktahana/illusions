/**
 * Web OAuth Implementation
 * 
 * GitHub OAuth using redirect flow with PKCE for security.
 * Works in all modern browsers.
 */

import { GitAuthResult, GitHubUser } from './git-storage-types';
import { getTokenStorage } from './token-storage';

/**
 * Web OAuth service
 */
export class WebOAuthService {
  private readonly clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID || '';
  private readonly redirectUri = typeof window !== 'undefined' 
    ? `${window.location.origin}/api/auth/github/callback`
    : '';
  private readonly scope = 'repo user:email';
  
  private readonly pkceStorageKey = 'github_pkce_verifier';
  private readonly stateStorageKey = 'github_oauth_state';

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
   * Start OAuth flow - redirects to GitHub authorization
   */
  async initiateLogin(): Promise<void> {
    if (!this.clientId) {
      throw new Error('GitHub Client ID not configured');
    }

    const state = this.generateState();
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);

    // Store state and verifier in sessionStorage
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(this.stateStorageKey, state);
      sessionStorage.setItem(this.pkceStorageKey, codeVerifier);
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: this.scope,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      allow_signup: 'true',
    });

    const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
    window.location.href = authUrl;
  }

  /**
   * Handle OAuth callback - extracts code and state from URL
   */
  async handleCallback(): Promise<GitAuthResult> {
    if (typeof window === 'undefined') {
      return {
        success: false,
        error: 'Window object not available',
      };
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');
    const errorDescription = params.get('error_description');

    // Check for errors from GitHub
    if (error) {
      return {
        success: false,
        error: `GitHub authorization failed: ${error} - ${errorDescription}`,
      };
    }

    if (!code) {
      return {
        success: false,
        error: 'No authorization code received',
      };
    }

    // Verify state to prevent CSRF
    const storedState = sessionStorage.getItem(this.stateStorageKey);
    if (state !== storedState) {
      return {
        success: false,
        error: 'Invalid state parameter - CSRF attack detected',
      };
    }

    const codeVerifier = sessionStorage.getItem(this.pkceStorageKey);
    if (!codeVerifier) {
      return {
        success: false,
        error: 'Code verifier not found',
      };
    }

    // Clear temporary storage
    sessionStorage.removeItem(this.stateStorageKey);
    sessionStorage.removeItem(this.pkceStorageKey);

    try {
      // Exchange code for access token
      const tokenResponse = await this.exchangeCodeForToken(code, codeVerifier);

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
   * Uses backend endpoint for security
   */
  private async exchangeCodeForToken(code: string, codeVerifier: string): Promise<{ access_token: string; token_type: string }> {
    const response = await fetch('/api/auth/github/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        code_verifier: codeVerifier,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Token exchange failed: ${error.message}`);
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
    sessionStorage.removeItem(this.stateStorageKey);
    sessionStorage.removeItem(this.pkceStorageKey);
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

  /**
   * Get the callback URL for configuration
   */
  getCallbackUrl(): string {
    return this.redirectUri;
  }
}

/**
 * Singleton instance
 */
let webOAuthInstance: WebOAuthService | null = null;

export function getWebOAuth(): WebOAuthService {
  if (!webOAuthInstance) {
    webOAuthInstance = new WebOAuthService();
  }
  return webOAuthInstance;
}

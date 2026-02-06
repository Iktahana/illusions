/**
 * GitHub Authentication Service
 * 
 * Manages GitHub authentication state, token storage, and user information.
 */

import { Octokit } from "@octokit/rest";
import { GitHubDeviceFlow } from "./device-flow";
import { encryptToken, decryptToken } from "../crypto";
import { fetchAppState, persistAppState } from "../app-state-manager";
import type { GitHubUser, DeviceCodeResponse, GitHubAuthState } from "./types";

export class GitHubAuthService {
  private deviceFlow: GitHubDeviceFlow;
  private octokit: Octokit | null = null;

  constructor() {
    this.deviceFlow = new GitHubDeviceFlow();
  }

  /**
   * Start the login process using Device Flow.
   * 
   * @param onDeviceCode - Callback to display user code to the user
   * @returns Authenticated user information
   */
  async login(
    onDeviceCode: (response: DeviceCodeResponse) => void
  ): Promise<GitHubUser> {
    // Authenticate using device flow
    const accessToken = await this.deviceFlow.authenticate(onDeviceCode);

    // Get user information
    const user = await this.getUserInfo(accessToken);

    // Encrypt and store token
    const encryptedToken = encryptToken(accessToken);
    await this.saveAuthState(encryptedToken, user);

    // Initialize Octokit with new token
    this.octokit = new Octokit({ auth: accessToken });

    return user;
  }

  /**
   * Logout and clear stored credentials.
   */
  async logout(): Promise<void> {
    // Clear GitHub auth data
    await persistAppState({ githubAuth: undefined });
    
    // Clear Octokit instance
    this.octokit = null;
  }

  /**
   * Get currently authenticated user.
   * Returns null if not authenticated.
   */
  async getCurrentUser(): Promise<GitHubUser | null> {
    const appState = await fetchAppState();
    
    if (!appState || !appState.githubAuth) {
      return null;
    }

    // Verify token is still valid
    try {
      const token = decryptToken(appState.githubAuth.encryptedToken);
      const user = await this.getUserInfo(token);
      
      // Initialize Octokit if not already done
      if (!this.octokit) {
        this.octokit = new Octokit({ auth: token });
      }
      
      return user;
    } catch (error) {
      console.error("Failed to get current user:", error);
      // Token might be invalid, clear auth state
      await this.logout();
      return null;
    }
  }

  /**
   * Check if user is currently authenticated.
   */
  async isAuthenticated(): Promise<boolean> {
    const user = await this.getCurrentUser();
    return user !== null;
  }

  /**
   * Get the current access token (decrypted).
   * Returns null if not authenticated.
   */
  async getAccessToken(): Promise<string | null> {
    const appState = await fetchAppState();
    
    if (!appState || !appState.githubAuth) {
      return null;
    }

    try {
      return decryptToken(appState.githubAuth.encryptedToken);
    } catch {
      return null;
    }
  }

  /**
   * Get an authenticated Octokit instance.
   * Returns null if not authenticated.
   */
  async getOctokit(): Promise<Octokit | null> {
    if (this.octokit) {
      return this.octokit;
    }

    const token = await this.getAccessToken();
    if (!token) {
      return null;
    }

    this.octokit = new Octokit({ auth: token });
    return this.octokit;
  }

  /**
   * Get user information from GitHub API.
   * 
   * @param accessToken - GitHub access token
   * @returns User information
   */
  private async getUserInfo(accessToken: string): Promise<GitHubUser> {
    const octokit = new Octokit({ auth: accessToken });
    
    const { data } = await octokit.rest.users.getAuthenticated();
    
    return {
      id: data.id,
      login: data.login,
      name: data.name || data.login,
      avatar_url: data.avatar_url,
      email: data.email,
      html_url: data.html_url,
    };
  }

  /**
   * Save authentication state to storage.
   */
  private async saveAuthState(
    encryptedToken: string,
    user: GitHubUser
  ): Promise<void> {
    await persistAppState({
      githubAuth: {
        encryptedToken,
        user,
        lastSync: Date.now(),
      },
    });
  }
}

// Singleton instance
let authServiceInstance: GitHubAuthService | null = null;

/**
 * Get the singleton GitHubAuthService instance.
 */
export function getGitHubAuthService(): GitHubAuthService {
  if (!authServiceInstance) {
    authServiceInstance = new GitHubAuthService();
  }
  return authServiceInstance;
}

/**
 * GitHub Integration Types
 * 
 * Type definitions for GitHub authentication, repositories, and API interactions.
 */

export interface GitHubUser {
  id: number;
  login: string;
  name: string;
  avatar_url: string;
  email: string | null;
  html_url: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
  };
  html_url: string;
  description: string | null;
  private: boolean;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  clone_url: string;
  default_branch: string;
}

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface AccessTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

export interface GitHubAuthState {
  isAuthenticated: boolean;
  user: GitHubUser | null;
  encryptedToken: string | null;
}

export interface CreateRepoOptions {
  name: string;
  description?: string;
  private?: boolean;
  auto_init?: boolean;
}

export interface GitHubError {
  message: string;
  documentation_url?: string;
  status?: number;
}

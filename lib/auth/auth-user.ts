/**
 * Shared auth user shape used by both the Electron and Web session adapters,
 * plus the mapping from the Electron userinfo IPC payload.
 */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
  plan: string;
}

/** Userinfo payload returned by `window.electronAPI.auth.getUserInfo`. */
export interface ElectronUserInfo {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
  plan: string;
}

export function toAuthUser(userInfo: ElectronUserInfo): AuthUser {
  return {
    id: userInfo.sub,
    email: userInfo.email,
    name: userInfo.name,
    image: userInfo.picture,
    plan: userInfo.plan,
  };
}

export type LocationPlatform = "darwin" | "win32" | "linux" | string;

export interface LocationFormatOptions {
  rootPath: string;
  homePath?: string | null;
  platform: LocationPlatform;
}

function trimTrailingSeparators(value: string, separatorPattern: RegExp): string {
  const trimmed = value.replace(separatorPattern, "");
  return trimmed || value;
}

function decodeUriComponentSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function formatUri(value: string): string | null {
  if (/^[a-zA-Z]:[\\/]/.test(value) || !/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value)) return null;
  try {
    const uri = new URL(value);
    uri.username = "";
    uri.password = "";
    uri.search = "";
    uri.hash = "";
    const authority = uri.host ? `//${uri.host}` : "//";
    return `${uri.protocol}${authority}${decodeUriComponentSafely(uri.pathname)}`;
  } catch {
    const withoutQuery = value.split(/[?#]/, 1)[0];
    return withoutQuery.replace(/^([a-zA-Z][a-zA-Z\d+.-]*:\/\/)[^/@]*@/, "$1");
  }
}

function isWithin(pathValue: string, root: string): boolean {
  return pathValue === root || pathValue.startsWith(`${root}/`);
}

/** Format a real filesystem/URI location without guessing providers or inventing roots. */
export function formatLocation({ rootPath, homePath, platform }: LocationFormatOptions): string {
  if (!rootPath) return rootPath;
  const uri = formatUri(rootPath);
  if (uri !== null) return uri;

  if (platform === "win32") {
    let windowsPath = rootPath.replace(/^\\\\\?\\UNC\\/i, "\\\\").replace(/^\\\\\?\\/, "");
    windowsPath = windowsPath.replace(/\//g, "\\");
    if (/^[a-zA-Z]:\\$/.test(windowsPath)) return windowsPath;
    return trimTrailingSeparators(windowsPath, /\\+$/);
  }

  const pathValue = trimTrailingSeparators(rootPath.replace(/\\/g, "/"), /\/+$/);
  const normalizedHome = homePath
    ? trimTrailingSeparators(homePath.replace(/\\/g, "/"), /\/+$/)
    : null;

  if (platform === "darwin" && normalizedHome) {
    const iCloudRoot = `${normalizedHome}/Library/Mobile Documents/com~apple~CloudDocs`;
    if (isWithin(pathValue, iCloudRoot)) {
      return `iCloud Drive${pathValue.slice(iCloudRoot.length)}`;
    }
  }
  if (normalizedHome && isWithin(pathValue, normalizedHome)) {
    return pathValue === normalizedHome ? "~" : `~${pathValue.slice(normalizedHome.length)}`;
  }
  return pathValue;
}

/** Avoid exposing URI credentials/tokens through a tooltip. Filesystem paths remain exact. */
export function safeLocationTitle(rootPath: string): string {
  return formatUri(rootPath) ?? rootPath;
}

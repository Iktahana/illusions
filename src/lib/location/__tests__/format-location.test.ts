import { describe, expect, it } from "vitest";

import { formatLocation, safeLocationTitle } from "../format-location";

describe("formatLocation", () => {
  it.each([
    ["/Users/花/Documents/小説", "/Users/花", "darwin", "~/Documents/小説"],
    [
      "/Users/花/Library/CloudStorage/GoogleDrive-account/My Drive/Novel",
      "/Users/花",
      "darwin",
      "~/Library/CloudStorage/GoogleDrive-account/My Drive/Novel",
    ],
    [
      "/Users/花/Library/Mobile Documents/com~apple~CloudDocs/Novel",
      "/Users/花",
      "darwin",
      "iCloud Drive/Novel",
    ],
    ["/Volumes/Synology/Novel", "/Users/花", "darwin", "/Volumes/Synology/Novel"],
    ["/Users/花子/Novel", "/Users/花", "darwin", "/Users/花子/Novel"],
    ["/home/alice/Nextcloud/Novel", "/home/alice", "linux", "~/Nextcloud/Novel"],
    ["/mnt/truenas/Novel/", "/home/alice", "linux", "/mnt/truenas/Novel"],
    [
      "/run/user/1000/gvfs/smb-share:server=nas,share=books/Novel",
      "/home/alice",
      "linux",
      "/run/user/1000/gvfs/smb-share:server=nas,share=books/Novel",
    ],
    [
      "C:\\Users\\alice\\OneDrive\\Novel\\",
      "C:\\Users\\alice",
      "win32",
      "C:\\Users\\alice\\OneDrive\\Novel",
    ],
    ["D:\\Google Drive\\Novel", "C:\\Users\\alice", "win32", "D:\\Google Drive\\Novel"],
    ["C:\\", "C:\\Users\\alice", "win32", "C:\\"],
    ["\\\\nas\\share\\Novel", null, "win32", "\\\\nas\\share\\Novel"],
    ["\\\\?\\UNC\\server\\DavWWWRoot\\Novel", null, "win32", "\\\\server\\DavWWWRoot\\Novel"],
    ["\\\\?\\C:\\Box\\Novel", null, "win32", "C:\\Box\\Novel"],
  ])("formats %s", (rootPath, homePath, platform, expected) => {
    expect(formatLocation({ rootPath, homePath, platform })).toBe(expected);
  });

  it.each([
    ["smb://user:secret@nas.local/share/My%20Novel?token=x#part", "smb://nas.local/share/My Novel"],
    ["webdav://[2001:db8::1]/dav/Novel", "webdav://[2001:db8::1]/dav/Novel"],
    ["rclone://remote/未知%20Cloud/Novel", "rclone://remote/未知 Cloud/Novel"],
    ["s3://bucket/Novel", "s3://bucket/Novel"],
  ])("sanitizes URI %s", (rootPath, expected) => {
    expect(formatLocation({ rootPath, platform: "linux" })).toBe(expected);
    expect(safeLocationTitle(rootPath)).toBe(expected);
  });
});

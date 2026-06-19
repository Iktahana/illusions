/* eslint-disable no-console */
// electron-builder afterPack hook: embed AND code-sign the MDI Quick Look
// Preview Extension (.appex) for the packaged macOS app.
//
// Why this hook does the signing itself (instead of letting electron-builder
// sign it):
//   - `extraFiles` copies the .appex but never code-signs it.
//   - electron-builder's signer (@electron/osx-sign via MacTargetHelper)
//     *explicitly ignores everything under Contents/PlugIns*
//     (`file.startsWith("/Contents/PlugIns", appPath.length)` in its `ignore`
//     callback). So neither the .appex bundle nor its inner Mach-O is ever
//     signed by electron-builder — and a `mac.binaries` entry is ignored for
//     the same reason. The unsigned nested bundle then fails the parent app
//     signing / notarization ("code object is not signed at all").
//
// Therefore we sign the .appex here, in afterPack (which runs *before* the app
// is signed), using a throwaway keychain built from the same CSC_LINK /
// CSC_KEY_PASSWORD credentials electron-builder uses. When electron-builder
// later signs the app it leaves Contents/PlugIns untouched, so our signature
// survives and the parent seal succeeds.
//
// On builds without signing credentials (local `--dir` builds, forks) the
// .appex is left as-is; those artifacts are not notarized.

const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");

const APPEX_NAME = "MDIQuickLook.appex";

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts })
    .toString()
    .trim();
}

/** Resolve CSC_LINK (base64 p12, file path, or file:// URL) to a local .p12 path. */
function resolveCertFile(cscLink, tmpDir) {
  if (cscLink.startsWith("file://")) {
    return cscLink.slice("file://".length);
  }
  if (fs.existsSync(cscLink)) {
    return cscLink;
  }
  const p12 = path.join(tmpDir, "mdiql-cert.p12");
  fs.writeFileSync(p12, Buffer.from(cscLink, "base64"));
  return p12;
}

/** Code-sign the .appex with Developer ID using a throwaway keychain. */
function signAppex(appexPath) {
  const cscLink = process.env.CSC_LINK;
  const cscPassword = process.env.CSC_KEY_PASSWORD || "";

  if (process.env.CSC_IDENTITY_AUTO_DISCOVERY === "false" || !cscLink) {
    console.log(
      `[QuickLook] No signing credentials (CSC_LINK); leaving ${APPEX_NAME} unsigned (non-notarized build).`,
    );
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mdiql-sign-"));
  const keychain = path.join(tmpDir, "mdiql.keychain-db");
  const keychainPassword = "mdiql-temp";
  const entitlements = path.join(__dirname, "..", "build", "entitlements.mac.plist");

  // The user keychain search list. `codesign` resolves the signing identity's
  // private key via the search list, so our throwaway keychain must be added to
  // it (just passing `--keychain` is not enough; without this codesign fails
  // with "The specified item could not be found in the keychain"). We restore
  // the original list afterwards so electron-builder's own signing is unaffected.
  let prevSearchList = null;

  try {
    const certFile = resolveCertFile(cscLink, tmpDir);

    run("/usr/bin/security", ["create-keychain", "-p", keychainPassword, keychain]);
    run("/usr/bin/security", ["unlock-keychain", "-p", keychainPassword, keychain]);
    run("/usr/bin/security", ["set-keychain-settings", keychain]);
    run("/usr/bin/security", [
      "import",
      certFile,
      "-k",
      keychain,
      "-T",
      "/usr/bin/codesign",
      "-P",
      cscPassword,
    ]);
    run("/usr/bin/security", [
      "set-key-partition-list",
      "-S",
      "apple-tool:,apple:,codesign:",
      "-s",
      "-k",
      keychainPassword,
      keychain,
    ]);

    prevSearchList = run("/usr/bin/security", ["list-keychains", "-d", "user"])
      .split("\n")
      .map((line) => line.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);
    run("/usr/bin/security", ["list-keychains", "-d", "user", "-s", keychain, ...prevSearchList]);

    const identities = run("/usr/bin/security", [
      "find-identity",
      "-v",
      "-p",
      "codesigning",
      keychain,
    ]);
    const match = identities.match(/\b([0-9A-F]{40})\b\s+"(Developer ID Application[^"]*)"/);
    if (!match) {
      throw new Error(
        `No "Developer ID Application" identity found in imported certificate.\n${identities}`,
      );
    }
    const identityHash = match[1];
    console.log(`[QuickLook] Signing ${APPEX_NAME} with ${match[2]}`);

    run("/usr/bin/codesign", [
      "--sign",
      identityHash,
      "--force",
      "--keychain",
      keychain,
      "--timestamp",
      "--options",
      "runtime",
      "--entitlements",
      entitlements,
      appexPath,
    ]);
    run("/usr/bin/codesign", ["--verify", "--strict", "--verbose=2", appexPath]);
    console.log(`[QuickLook] ✅ ${APPEX_NAME} signed with Developer ID + hardened runtime`);
  } finally {
    if (prevSearchList) {
      try {
        run("/usr/bin/security", ["list-keychains", "-d", "user", "-s", ...prevSearchList]);
      } catch {
        /* best-effort restore */
      }
    }
    try {
      run("/usr/bin/security", ["delete-keychain", keychain]);
    } catch {
      /* keychain may not exist if setup failed early */
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

exports.default = async function embedQuickLook(context) {
  const { electronPlatformName, appOutDir, packager } = context;

  if (electronPlatformName !== "darwin") {
    return;
  }

  const appexSource = path.join(__dirname, "..", "build", "quicklook", APPEX_NAME);

  if (!fs.existsSync(appexSource)) {
    // The .appex is produced by `npm run build:quicklook` (macOS only), which
    // runs before electron:build in CI. Missing here means it was not built.
    console.warn(
      `[QuickLook] ${APPEX_NAME} not found at ${appexSource}; skipping embed. ` +
        "Run `npm run build:quicklook` before packaging on macOS.",
    );
    return;
  }

  const appName = packager.appInfo.productFilename;
  const pluginsDir = path.join(appOutDir, `${appName}.app`, "Contents", "PlugIns");
  const dest = path.join(pluginsDir, APPEX_NAME);

  fs.mkdirSync(pluginsDir, { recursive: true });
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(appexSource, dest, { recursive: true });
  console.log(`[QuickLook] Embedded ${APPEX_NAME} into ${pluginsDir}`);

  // electron-builder ignores Contents/PlugIns during signing, so sign here.
  signAppex(dest);
};

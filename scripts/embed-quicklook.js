/* eslint-disable no-console */
// electron-builder afterPack hook.
//
// Embeds the MDI Quick Look Preview Extension (.appex) into the packaged macOS
// app *before* code signing. This is intentionally an afterPack hook (not
// `extraFiles`): files added via `extraFiles` are copied but NOT code-signed,
// so the nested Mach-O fails notarization ("not signed with a valid Developer
// ID certificate / no secure timestamp / hardened runtime not enabled").
// By copying it into Contents/PlugIns here, electron-builder's osx-sign step
// signs it with the Developer ID identity, hardened runtime, secure timestamp,
// and inherited entitlements as part of the normal signing walk.

const path = require("path");
const fs = require("fs");

const APPEX_NAME = "MDIQuickLook.appex";

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

  console.log(`[QuickLook] Embedded ${APPEX_NAME} into ${pluginsDir} (will be signed by electron-builder)`);
};

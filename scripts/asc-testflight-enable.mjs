#!/usr/bin/env node
/**
 * Waits until an already-uploaded build is valid for internal TestFlight
 * testers. Internal testers receive valid builds automatically; App Store
 * Connect rejects attempts to assign those builds to an internal beta group.
 *
 * Requires env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_API_KEY (base64 .p8), ASC_APP_ID.
 * Usage: node scripts/asc-testflight-enable.mjs <CFBundleVersion>
 *   (the unique build number passed to --config.mas.bundleVersion, not the
 *   marketing version — multiple builds can share the same marketing
 *   version, so matching on that would pick up a stale build)
 */
import crypto from "crypto";

const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_API_KEY, ASC_APP_ID } = process.env;
const buildNumber = process.argv[2];

if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_API_KEY || !ASC_APP_ID) {
  console.error("Missing ASC_KEY_ID / ASC_ISSUER_ID / ASC_API_KEY / ASC_APP_ID");
  process.exit(1);
}
if (!buildNumber) {
  console.error("Usage: node scripts/asc-testflight-enable.mjs <CFBundleVersion>");
  process.exit(1);
}

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function makeJwt() {
  const privateKeyPem = Buffer.from(ASC_API_KEY, "base64").toString("utf8");
  const header = { alg: "ES256", kid: ASC_KEY_ID, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: ASC_ISSUER_ID, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto
    .createSign("SHA256")
    .update(signingInput)
    .sign({ key: privateKeyPem, dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${base64url(signature)}`;
}

const BASE = "https://api.appstoreconnect.apple.com/v1";

async function asc(path, options = {}) {
  const jwt = makeJwt();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    console.error(`ASC API ${options.method || "GET"} ${path} -> ${res.status}`);
    console.error(JSON.stringify(body, null, 2));
    throw new Error(`ASC API request failed: ${res.status}`);
  }
  return body;
}

async function findBuild(buildNumber, { retries = 20, delayMs = 30000 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    // Fetch recent builds and match on the exact CFBundleVersion rather than
    // relying on `filter[version]` — several builds can share the same
    // marketing (CFBundleShortVersionString) value, and it's unclear from
    // testing whether that filter matches on that or CFBundleVersion, so
    // matching client-side on the unique number is the reliable option.
    const res = await asc(`/builds?filter[app]=${ASC_APP_ID}&sort=-uploadedDate&limit=10`);
    const build = res.data?.find((b) => b.attributes.version === buildNumber);
    if (build) {
      console.log(`Found build ${build.id} (state: ${build.attributes.processingState})`);
      if (build.attributes.processingState === "VALID") {
        return build;
      }
      console.log(`  still processing (${build.attributes.processingState}), waiting...`);
    } else {
      console.log(
        `Build with CFBundleVersion ${buildNumber} not visible yet, waiting... (attempt ${attempt}/${retries})`,
      );
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`Build ${buildNumber} did not become VALID within timeout`);
}

await findBuild(buildNumber);
// Export compliance is declared once via ITSAppUsesNonExemptEncryption in
// the Info.plist (package.json's mac.extendInfo) — App Store Connect reads
// it from the binary automatically, and re-confirming the same value via
// PATCH /builds/{id} 409s with "You cannot update when the value is already
// set", so there's nothing to do here.
console.log(`\n✅ Build ${buildNumber} is valid and available via TestFlight to internal testers.`);

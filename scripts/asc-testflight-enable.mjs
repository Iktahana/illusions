#!/usr/bin/env node
/**
 * Makes an already-uploaded build available to internal TestFlight testers.
 *
 * Requires env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_API_KEY (base64 .p8), ASC_APP_ID.
 * Usage: node scripts/asc-testflight-enable.mjs <version>  (e.g. 1.3.3)
 */
import crypto from "crypto";

const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_API_KEY, ASC_APP_ID } = process.env;
const version = process.argv[2];

if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_API_KEY || !ASC_APP_ID) {
  console.error("Missing ASC_KEY_ID / ASC_ISSUER_ID / ASC_API_KEY / ASC_APP_ID");
  process.exit(1);
}
if (!version) {
  console.error("Usage: node scripts/asc-testflight-enable.mjs <version>");
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

async function findBuild(version, { retries = 20, delayMs = 30000 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await asc(
      `/builds?filter[app]=${ASC_APP_ID}&filter[version]=${encodeURIComponent(version)}&sort=-uploadedDate&limit=5`,
    );
    const build = res.data?.[0];
    if (build) {
      console.log(`Found build ${build.id} (state: ${build.attributes.processingState})`);
      if (build.attributes.processingState === "VALID") {
        return build;
      }
      console.log(`  still processing (${build.attributes.processingState}), waiting...`);
    } else {
      console.log(`Build ${version} not visible yet, waiting... (attempt ${attempt}/${retries})`);
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`Build ${version} did not become VALID within timeout`);
}

async function ensureExportCompliance(buildId) {
  await asc(`/builds/${buildId}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: { type: "builds", id: buildId, attributes: { usesNonExemptEncryption: false } },
    }),
  });
  console.log("Export compliance confirmed (exempt encryption only).");
}

async function findOrGetInternalGroup() {
  const res = await asc(`/apps/${ASC_APP_ID}/betaGroups?filter[isInternalGroup]=true`);
  const group = res.data?.[0];
  if (!group) {
    throw new Error(
      "No internal beta group found for this app. Create one in App Store Connect → TestFlight → Internal Testing first (this is a one-time manual step Apple requires).",
    );
  }
  console.log(`Internal group: ${group.attributes.name} (${group.id})`);
  return group;
}

async function addBuildToGroup(groupId, buildId) {
  await asc(`/betaGroups/${groupId}/relationships/builds`, {
    method: "POST",
    body: JSON.stringify({ data: [{ type: "builds", id: buildId }] }),
  });
  console.log("Build added to internal TestFlight group.");
}

const build = await findBuild(version);
await ensureExportCompliance(build.id);
const group = await findOrGetInternalGroup();
await addBuildToGroup(group.id, build.id);
console.log(`\n✅ Build ${version} is now available via TestFlight to internal testers.`);

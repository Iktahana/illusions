#!/usr/bin/env node
/**
 * Creates (or resumes) a macOS App Store version for an uploaded build,
 * syncs the Japanese storefront metadata, and submits it to App Review.
 *
 * Required env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_API_KEY (base64 .p8), ASC_APP_ID
 * Usage: node scripts/asc-submit-appstore-version.mjs <CFBundleVersion>
 *        node scripts/asc-submit-appstore-version.mjs --dry-run --version <X.Y.Z>
 */
import crypto from "crypto";
import fs from "fs/promises";

const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_API_KEY, ASC_APP_ID } = process.env;
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const versionFlagIndex = args.indexOf("--version");
const suppliedVersion = versionFlagIndex === -1 ? undefined : args[versionFlagIndex + 1];
const buildNumber = args.find(
  (arg, index) => !arg.startsWith("--") && (index === 0 || args[index - 1] !== "--version"),
);
const BASE = "https://api.appstoreconnect.apple.com/v1";

if (dryRun) {
  if (!suppliedVersion || !/^\d+\.\d+\.\d+$/.test(suppliedVersion)) {
    console.error(
      "Dry run usage: node scripts/asc-submit-appstore-version.mjs --dry-run --version <X.Y.Z>",
    );
    process.exit(1);
  }
} else if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_API_KEY || !ASC_APP_ID || !buildNumber) {
  console.error(
    "Usage requires ASC_KEY_ID, ASC_ISSUER_ID, ASC_API_KEY, ASC_APP_ID, and CFBundleVersion",
  );
  process.exit(1);
}

function base64url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function token() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: ASC_KEY_ID, typ: "JWT" };
  const payload = { iss: ASC_ISSUER_ID, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" };
  const input = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto
    .createSign("SHA256")
    .update(input)
    .sign({ key: Buffer.from(ASC_API_KEY, "base64").toString("utf8"), dsaEncoding: "ieee-p1363" });
  return `${input}.${base64url(signature)}`;
}

async function asc(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    console.error(`ASC API ${options.method || "GET"} ${path} -> ${response.status}`);
    console.error(JSON.stringify(body, null, 2));
    const error = new Error(`App Store Connect request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function findValidBuild() {
  for (let attempt = 1; attempt <= 20; attempt++) {
    const builds = await asc(`/builds?filter[app]=${ASC_APP_ID}&sort=-uploadedDate&limit=50`);
    const build = builds.data?.find((item) => item.attributes.version === buildNumber);
    if (build?.attributes.processingState === "VALID") return build;
    console.log(
      `Build ${buildNumber} is not VALID yet (attempt ${attempt}/20); waiting 30 seconds.`,
    );
    await delay(30_000);
  }
  throw new Error(`Build ${buildNumber} did not become VALID within 10 minutes`);
}

async function marketingVersion(buildId) {
  const prerelease = await asc(`/builds/${buildId}/preReleaseVersion`);
  const version = prerelease.data?.attributes.version;
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Build ${buildId} has invalid marketing version '${version ?? "missing"}'`);
  }
  return version;
}

async function storeText(path) {
  const source = await fs.readFile(path, "utf8");
  const content = source.includes("\n---\n") ? source.split("\n---\n", 2)[1] : source;
  return content.replace(/<!--[^]*?-->/g, "").trim();
}

async function releaseNotes(versionString, fallback) {
  const repository = process.env.GITHUB_REPOSITORY;
  const githubToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!repository || !githubToken) return fallback;

  const response = await fetch(
    `https://api.github.com/repos/${repository}/releases/tags/v${encodeURIComponent(versionString)}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${githubToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!response.ok) {
    console.log(
      `GitHub release notes were unavailable (${response.status}); using the checked-in fallback.`,
    );
    return fallback;
  }
  const body = (await response.json()).body?.trim();
  return body || fallback;
}

async function metadata(versionString) {
  const root = "assets/store/apple/ja";
  const [description, keywords, promotionalText, whatsNew] = await Promise.all([
    storeText(`${root}/description.md`),
    storeText(`${root}/keywords.md`),
    storeText(`${root}/promotional-text.md`),
    storeText(`${root}/release-notes.md`),
  ]);
  if (!description || !keywords || !whatsNew)
    throw new Error("Apple storefront metadata files must not be empty");
  return {
    locale: "ja",
    description,
    keywords,
    promotionalText,
    whatsNew: await releaseNotes(versionString, whatsNew),
  };
}

async function getOrCreateVersion(versionString) {
  const versions = await asc(
    `/apps/${ASC_APP_ID}/appStoreVersions?filter[platform]=MAC_OS&limit=200`,
  );
  const existing = versions.data?.find((item) => item.attributes.versionString === versionString);
  if (existing) return existing;
  const created = await asc("/appStoreVersions", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "appStoreVersions",
        attributes: {
          platform: "MAC_OS",
          versionString,
          copyright: `© ${new Date().getUTCFullYear()} 幾田花`,
          releaseType: "AFTER_APPROVAL",
          usesIdfa: false,
        },
        relationships: { app: { data: { type: "apps", id: ASC_APP_ID } } },
      },
    }),
  });
  return created.data;
}

async function syncLocalization(versionId, attributes) {
  const localizations = await asc(
    `/appStoreVersions/${versionId}/appStoreVersionLocalizations?limit=200`,
  );
  const existing = localizations.data?.find((item) => item.attributes.locale === attributes.locale);
  const data = existing
    ? { type: "appStoreVersionLocalizations", id: existing.id, attributes }
    : {
        type: "appStoreVersionLocalizations",
        attributes,
        relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: versionId } } },
      };
  await asc(
    existing ? `/appStoreVersionLocalizations/${existing.id}` : "/appStoreVersionLocalizations",
    {
      method: existing ? "PATCH" : "POST",
      body: JSON.stringify({ data }),
    },
  );
}

async function pendingSubmissionFor(versionId) {
  const submissions = await asc(`/apps/${ASC_APP_ID}/reviewSubmissions?limit=200`);
  for (const submission of submissions.data || []) {
    if (
      !["READY_FOR_REVIEW", "WAITING_FOR_REVIEW", "IN_REVIEW"].includes(submission.attributes.state)
    )
      continue;
    const items = await asc(
      `/reviewSubmissions/${submission.id}/items?include=appStoreVersion&limit=200`,
    );
    if (items.data?.some((item) => item.relationships?.appStoreVersion?.data?.id === versionId))
      return submission;
  }
  return null;
}

async function submitForReview(versionId) {
  const current = await pendingSubmissionFor(versionId);
  if (current) {
    console.log(
      `Version is already in review submission ${current.id} (${current.attributes.state}).`,
    );
    return;
  }
  const submission = await asc("/reviewSubmissions", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "reviewSubmissions",
        relationships: { app: { data: { type: "apps", id: ASC_APP_ID } } },
      },
    }),
  });
  await asc("/reviewSubmissionItems", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "reviewSubmissionItems",
        relationships: {
          reviewSubmission: { data: { type: "reviewSubmissions", id: submission.data.id } },
          appStoreVersion: { data: { type: "appStoreVersions", id: versionId } },
        },
      },
    }),
  });
  await asc(`/reviewSubmissions/${submission.data.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: { type: "reviewSubmissions", id: submission.data.id, attributes: { submitted: true } },
    }),
  });
  console.log(`Submitted App Store review submission ${submission.data.id}.`);
}

if (dryRun) {
  const plannedMetadata = await metadata(suppliedVersion);
  console.log(
    JSON.stringify(
      {
        mode: "dry-run",
        appStoreVersion: {
          platform: "MAC_OS",
          versionString: suppliedVersion,
          releaseType: "AFTER_APPROVAL",
          usesIdfa: false,
        },
        localization: plannedMetadata,
        buildAttachment: "A processed MAS build with the same marketing version",
        reviewSubmission: "Create a review submission and set submitted=true",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const build = await findValidBuild();
const versionString = await marketingVersion(build.id);
const version = await getOrCreateVersion(versionString);
const state = version.attributes.appStoreState;
if (!["PREPARE_FOR_SUBMISSION", "READY_FOR_REVIEW"].includes(state)) {
  console.log(`App Store version ${versionString} is already ${state}; no changes needed.`);
  process.exit(0);
}
await syncLocalization(version.id, await metadata(versionString));
await asc(`/appStoreVersions/${version.id}/relationships/build`, {
  method: "PATCH",
  body: JSON.stringify({ data: { type: "builds", id: build.id } }),
});
await submitForReview(version.id);
console.log(`✅ App Store version ${versionString} now uses build ${buildNumber}.`);

#!/usr/bin/env node
/**
 * Microsoft Store Submission API — listing update + binary submission script
 *
 * Replaces msstore-cli publish. Handles:
 *   1. Azure AD authentication
 *   2. Submission creation (or reuse of existing pending submission)
 *   3. Store listing update from Markdown files
 *   4. Package upload via SAS URL
 *   5. Commit + polling
 *
 * Required environment variables:
 *   MSSTORE_TENANT_ID     - Azure AD tenant ID
 *   MSSTORE_CLIENT_ID     - Azure AD app client ID
 *   MSSTORE_CLIENT_SECRET - Azure AD app client secret
 *   STORE_PRODUCT_ID      - Microsoft Store app ID (e.g. "9MTCC0CT16XG1")
 *   MSIX_DIR              - Directory containing .appx packages (default: "msix-packages")
 *
 * Optional:
 *   SUBMISSION_MODE   - "listing-only" or "full-submission" (default: "full-submission")
 *   DRY_RUN=true     - Log API calls without mutating state (credentials not required)
 *   POLL_TIMEOUT_MS  - Polling timeout in ms (default: 600000 = 10 min)
 */

import { readFileSync, existsSync, readdirSync, createReadStream, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DRY_RUN = process.env.DRY_RUN === "true";
const SUBMISSION_MODE = process.env.SUBMISSION_MODE ?? "full-submission";
const LISTING_ONLY = SUBMISSION_MODE === "listing-only";
const TENANT_ID = process.env.MSSTORE_TENANT_ID;
const CLIENT_ID = process.env.MSSTORE_CLIENT_ID;
const CLIENT_SECRET = process.env.MSSTORE_CLIENT_SECRET;
const APP_ID = process.env.STORE_PRODUCT_ID;
const MSIX_DIR = resolve(process.env.MSIX_DIR ?? "msix-packages");
const POLL_TIMEOUT_MS = Number(process.env.POLL_TIMEOUT_MS ?? 600_000);

const API_BASE = "https://manage.devcenter.microsoft.com/v1.0/my";
const STORE_METADATA_DIR = resolve(__dirname, "..", "store", "microsoft", "ja-JP");
const TERMS_PATH = resolve(__dirname, "..", "TERMS.md");
const TERMS_CANONICAL_URL = "https://github.com/Iktahana/illusions/blob/main/TERMS.md";

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/**
 * Obtains an Azure AD access token for the Store Submission API.
 * @returns {Promise<string>} Bearer token
 */
async function getAccessToken() {
  const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: "https://manage.devcenter.microsoft.com/.default",
  });

  const res = await fetch(url, { method: "POST", body });
  const data = await res.json();

  if (!data.access_token) {
    throw new Error(`Authentication failed: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

/**
 * @param {string} token
 * @param {string} path  Relative path under API_BASE
 * @returns {Promise<object>}
 */
async function apiGet(token, path) {
  if (DRY_RUN) {
    console.log(`[dry-run] GET ${path}`);
    return {};
  }
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * @param {string} token
 * @param {string} path
 * @param {object|null} body
 * @returns {Promise<object>}
 */
async function apiPost(token, path, body) {
  if (DRY_RUN) {
    console.log(`[dry-run] POST ${path}`);
    return { id: "dry-run-submission-id", fileUploadUrl: "" };
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`POST ${path} → ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * @param {string} token
 * @param {string} path
 * @param {object} body
 * @returns {Promise<object>}
 */
async function apiPut(token, path, body) {
  if (DRY_RUN) {
    console.log(`[dry-run] PUT ${path}`);
    return body;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`PUT ${path} → ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * @param {string} token
 * @param {string} path
 * @returns {Promise<void>}
 */
async function apiDelete(token, path) {
  if (DRY_RUN) {
    console.log(`[dry-run] DELETE ${path}`);
    return;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`DELETE ${path} → ${res.status}: ${await res.text()}`);
  }
}

// ---------------------------------------------------------------------------
// Markdown parsing
// ---------------------------------------------------------------------------

/**
 * Strips HTML comments from text.
 * @param {string} text
 * @returns {string}
 */
function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

/**
 * Reads a Markdown file, strips HTML comments, and returns trimmed content.
 * @param {string} name  Filename within STORE_METADATA_DIR
 * @param {{ required?: boolean }} [options]
 * @returns {string}
 */
function readListingFile(name, { required = true } = {}) {
  const filePath = join(STORE_METADATA_DIR, name);
  if (!required && !existsSync(filePath)) return "";
  const raw = readFileSync(filePath, "utf-8");
  return stripHtmlComments(raw).trim();
}

/**
 * Parses a Markdown bullet list into an array of strings.
 * Only lines starting with `-`, `*`, or `+` are included; everything else is ignored.
 * @param {string} markdown
 * @returns {string[]}
 */
function parseBulletList(markdown) {
  return markdown
    .split("\n")
    .filter((line) => /^[-*+]\s+/.test(line))
    .map((line) => line.replace(/^[-*+]\s+/, "").trim())
    .filter((line) => line.length > 0);
}

/**
 * Reads TERMS.md from the repo root, strips Markdown formatting to plain text,
 * and appends the canonical URL line.
 * @returns {string}
 */
function readLicenseTerms() {
  if (!existsSync(TERMS_PATH)) return "";
  const raw = readFileSync(TERMS_PATH, "utf-8");
  const plain = raw
    .replace(/^#{1,6}\s+/gm, "") // strip heading markers
    .replace(/\*\*(.+?)\*\*/g, "$1") // strip bold
    .replace(/\*(.+?)\*/g, "$1") // strip italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [text](url) → text
    .replace(/^\s*[-*+]\s+/gm, "") // strip list markers (including indented)
    .replace(/^---$/gm, "") // strip horizontal rules
    .replace(/`([^`]+)`/g, "$1") // strip inline code
    .replace(/\n{3,}/g, "\n\n") // collapse excessive blank lines
    .trim();
  return plain + `\n\n最新バーション（正本）：${TERMS_CANONICAL_URL}`;
}

// ---------------------------------------------------------------------------
// Package handling
// ---------------------------------------------------------------------------

/**
 * Returns the list of .appx filenames in MSIX_DIR.
 * @returns {string[]}
 */
function findAppxFiles() {
  const entries = readdirSync(MSIX_DIR);
  const appxFiles = entries.filter((f) => f.endsWith(".appx"));
  if (appxFiles.length === 0) {
    throw new Error(`No .appx files found in ${MSIX_DIR}`);
  }
  return appxFiles;
}

/**
 * Creates a ZIP archive from all .appx files in MSIX_DIR using PowerShell.
 * The ZIP contains each .appx at the root level (no subdirectory).
 * @returns {string} Absolute path to the created ZIP file
 */
function createPackageZip() {
  const zipPath = join(tmpdir(), "store-package-upload.zip");
  const appxFiles = findAppxFiles();
  const appxPaths = appxFiles.map((f) => join(MSIX_DIR, f)).join("','");

  // PowerShell's Compress-Archive places files at root when given full paths
  const cmd = `powershell -NoProfile -Command "Compress-Archive -Path '${appxPaths}' -DestinationPath '${zipPath}' -Force"`;
  console.log(`  Creating package ZIP: ${zipPath}`);

  if (!DRY_RUN) {
    execSync(cmd, { stdio: "inherit" });
  } else {
    console.log(`  [dry-run] ${cmd}`);
  }

  return zipPath;
}

/**
 * Uploads a ZIP file to the Azure Blob SAS URL provided by the Submission API.
 * @param {string} sasUrl
 * @param {string} zipPath
 * @returns {Promise<void>}
 */
async function uploadPackageToSas(sasUrl, zipPath) {
  if (!sasUrl) {
    throw new Error(
      "fileUploadUrl is empty — cannot upload packages. The Store API did not provide an upload URL.",
    );
  }

  const { size: fileSize } = statSync(zipPath);
  console.log(`  Uploading ${(fileSize / 1024 / 1024).toFixed(1)} MB to SAS URL...`);

  // Stream the file to avoid loading large packages into memory
  const webStream = Readable.toWeb(createReadStream(zipPath));

  const res = await fetch(sasUrl, {
    method: "PUT",
    headers: {
      "x-ms-blob-type": "BlockBlob",
      "Content-Type": "application/zip",
      "Content-Length": String(fileSize),
    },
    body: webStream,
    duplex: "half",
  });

  if (!res.ok) {
    throw new Error(`SAS upload failed: ${res.status} ${await res.text()}`);
  }
}

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------

/**
 * Polls submission status until commitStatus is no longer "CommitStarted".
 * @param {string} token
 * @param {string} submissionId
 * @returns {Promise<object>} Final submission object
 */
async function pollSubmissionStatus(token, submissionId) {
  const start = Date.now();
  const intervalMs = 15_000;

  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const sub = await apiGet(token, `/applications/${APP_ID}/submissions/${submissionId}`);
    // The Store API uses "status" for newer endpoints and "commitStatus" for legacy
    const status = sub.commitStatus ?? sub.status;
    console.log(`  commitStatus: ${sub.commitStatus}, status: ${sub.status}`);

    if (status && status !== "CommitStarted" && status !== "InProgress") {
      return sub;
    }

    // If status is undefined on first poll, wait and retry before giving up
    if (!status) {
      console.log("  Status is undefined — waiting for Store API to reflect commit...");
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`Submission polling timed out after ${POLL_TIMEOUT_MS / 1000}s`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(
    `Mode: ${SUBMISSION_MODE}${LISTING_ONLY ? " (listing metadata only, no package upload)" : ""}`,
  );

  if (DRY_RUN) {
    console.log("=== DRY RUN MODE — no mutations will be made ===\n");
  } else if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET || !APP_ID) {
    throw new Error(
      "Missing required environment variables: " +
        "MSSTORE_TENANT_ID, MSSTORE_CLIENT_ID, MSSTORE_CLIENT_SECRET, STORE_PRODUCT_ID",
    );
  }

  // --- Step 1: Read listing content ---
  console.log("Reading store listing content...");
  const description = readListingFile("description.md");
  const shortDescription = readListingFile("short-description.md");
  const featuresMarkdown = readListingFile("features.md");
  const releaseNotes = readListingFile("release-notes.md", { required: false });
  const licenseTerms = readLicenseTerms();
  const features = parseBulletList(featuresMarkdown);

  console.log(`  description:      ${description.length} chars`);
  console.log(`  shortDescription: ${shortDescription.length} chars`);
  console.log(`  features:         ${features.length} items`);
  console.log(`  releaseNotes:     ${releaseNotes.length} chars`);
  console.log(`  licenseTerms:     ${licenseTerms.length} chars`);

  // --- Step 2: Authenticate ---
  let token = "dry-run-token";
  if (!DRY_RUN) {
    console.log("\nAuthenticating with Azure AD...");
    token = await getAccessToken();
    console.log("  OK");
  }

  // --- Step 3: Get app info + resolve pending submission ---
  let submissionId;
  let fileUploadUrl;

  console.log(`\nFetching app info for ${APP_ID}...`);
  const app = await apiGet(token, `/applications/${APP_ID}`);

  if (app.pendingApplicationSubmission?.id) {
    const pendingId = app.pendingApplicationSubmission.id;

    if (LISTING_ONLY) {
      // In listing-only mode, refuse to touch an existing pending submission.
      // It may contain package uploads or manual Partner Center edits that
      // would be inadvertently committed along with the listing update.
      throw new Error(
        `A pending submission already exists (${pendingId}). ` +
          "listing-only mode refuses to reuse it to avoid accidentally committing " +
          "unrelated package or draft changes. " +
          "Please complete or delete the pending submission in Partner Center first, " +
          "then re-run this workflow.",
      );
    }

    // In full-submission mode, always delete the pending submission and create
    // a fresh one. A pending submission in PreProcessing or validation state
    // cannot be updated (409 InvalidState), so reusing it would fail.
    console.log(`  Deleting existing pending submission: ${pendingId}`);
    await apiDelete(token, `/applications/${APP_ID}/submissions/${pendingId}`);
  }

  // --- Step 4: Create new submission (if no pending submission to reuse) ---
  if (!submissionId) {
    console.log("\nCreating new submission...");
    const newSub = await apiPost(token, `/applications/${APP_ID}/submissions`, null);
    submissionId = newSub.id;
    fileUploadUrl = newSub.fileUploadUrl;
    console.log(`  Submission ID: ${submissionId}`);
  }

  // --- Step 5: Get full submission details ---
  console.log("\nGetting submission details...");
  const submission = await apiGet(token, `/applications/${APP_ID}/submissions/${submissionId}`);

  // --- Step 6: Update listing ---
  console.log("\nUpdating store listing (ja-JP)...");
  if (!submission.listings) submission.listings = {};
  if (!submission.listings["ja-jp"]) {
    submission.listings["ja-jp"] = { baseListing: {} };
  }

  const listing = submission.listings["ja-jp"].baseListing;
  listing.description = description;
  listing.shortDescription = shortDescription;
  listing.features = features;
  listing.releaseNotes = releaseNotes;
  if (licenseTerms) listing.licenseTerms = licenseTerms;

  // --- Step 7: Set application packages (full-submission only) ---
  if (!LISTING_ONLY) {
    const appxFiles = DRY_RUN ? ["example.appx"] : findAppxFiles();
    console.log(`\nPackages to submit: ${appxFiles.join(", ")}`);

    // Mark all existing packages as PendingDelete.
    // The Store API requires every previously-uploaded package to be present in
    // the payload; omitting them causes a 400 "missing packages" error.
    const existingPackages = (submission.applicationPackages ?? []).map((pkg) => ({
      ...pkg,
      fileStatus: "PendingDelete",
    }));

    const newPackages = appxFiles.map((fileName) => ({
      fileName,
      fileStatus: "PendingUpload",
      minimumDirectXVersion: "None",
      minimumSystemRam: "None",
    }));

    submission.applicationPackages = [...existingPackages, ...newPackages];
  } else {
    console.log("\nSkipping package configuration (listing-only mode).");
  }

  // --- Step 8: PUT updated submission ---
  console.log("\nSaving submission changes...");
  await apiPut(token, `/applications/${APP_ID}/submissions/${submissionId}`, submission);

  // --- Step 9: Upload packages (full-submission only) ---
  if (!LISTING_ONLY) {
    if (DRY_RUN) {
      console.log("\n[dry-run] Skipping package ZIP creation and upload.");
    } else {
      console.log("\nPreparing package ZIP...");
      const zipPath = createPackageZip();
      console.log("\nUploading packages to Azure Blob Storage...");
      await uploadPackageToSas(fileUploadUrl, zipPath);
    }
  }

  // --- Step 10: Commit ---
  console.log("\nCommitting submission...");
  const commitResponse = await apiPost(
    token,
    `/applications/${APP_ID}/submissions/${submissionId}/commit`,
    null,
  );
  console.log(`  Commit response: ${JSON.stringify(commitResponse)}`);

  // --- Step 11: Poll ---
  console.log("\nPolling submission status...");
  const finalSubmission = DRY_RUN
    ? { commitStatus: "CommitStarted (dry-run)" }
    : await pollSubmissionStatus(token, submissionId);

  const finalStatus = finalSubmission.commitStatus ?? finalSubmission.status;
  console.log(
    `\nFinal status: commitStatus=${finalSubmission.commitStatus}, status=${finalSubmission.status}`,
  );

  if (finalStatus === "CommitFailed" || finalStatus === "Failed") {
    throw new Error(
      `Submission commit failed: ${JSON.stringify(finalSubmission.statusDetails ?? finalSubmission)}`,
    );
  }

  console.log("\nStore submission completed successfully.");
}

main().catch((err) => {
  console.error("\nFATAL:", err.message);
  process.exit(1);
});

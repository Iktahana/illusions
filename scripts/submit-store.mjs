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
 *   DRY_RUN=true          - Log API calls without mutating state
 *   POLL_TIMEOUT_MS       - Polling timeout in ms (default: 600000 = 10 min)
 */

import { readFileSync, readdirSync, createReadStream } from 'node:fs';
import { resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DRY_RUN = process.env.DRY_RUN === 'true';
const TENANT_ID = process.env.MSSTORE_TENANT_ID;
const CLIENT_ID = process.env.MSSTORE_CLIENT_ID;
const CLIENT_SECRET = process.env.MSSTORE_CLIENT_SECRET;
const APP_ID = process.env.STORE_PRODUCT_ID;
const MSIX_DIR = resolve(process.env.MSIX_DIR ?? 'msix-packages');
const POLL_TIMEOUT_MS = Number(process.env.POLL_TIMEOUT_MS ?? 600_000);

const API_BASE = 'https://manage.devcenter.microsoft.com/v1.0/my';
const STORE_METADATA_DIR = resolve(__dirname, '..', 'store', 'microsoft', 'ja-JP');

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
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: 'https://manage.devcenter.microsoft.com/.default',
  });

  const res = await fetch(url, { method: 'POST', body });
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
    return { id: 'dry-run-submission-id', fileUploadUrl: '' };
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
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
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
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
    method: 'DELETE',
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
 * Reads a Markdown file and returns its trimmed content as plain text.
 * @param {string} name  Filename within STORE_METADATA_DIR
 * @returns {string}
 */
function readListingFile(name) {
  const filePath = join(STORE_METADATA_DIR, name);
  return readFileSync(filePath, 'utf-8').trim();
}

/**
 * Parses a Markdown bullet list into an array of strings.
 * Supports `-`, `*`, `+` list markers.
 * @param {string} markdown
 * @returns {string[]}
 */
function parseBulletList(markdown) {
  return markdown
    .split('\n')
    .map((line) => line.replace(/^[-*+]\s+/, '').trim())
    .filter((line) => line.length > 0);
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
  const appxFiles = entries.filter((f) => f.endsWith('.appx'));
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
  const zipPath = join(tmpdir(), 'store-package-upload.zip');
  const appxFiles = findAppxFiles();
  const appxPaths = appxFiles.map((f) => join(MSIX_DIR, f)).join("','");

  // PowerShell's Compress-Archive places files at root when given full paths
  const cmd = `powershell -NoProfile -Command "Compress-Archive -Path '${appxPaths}' -DestinationPath '${zipPath}' -Force"`;
  console.log(`  Creating package ZIP: ${zipPath}`);

  if (!DRY_RUN) {
    execSync(cmd, { stdio: 'inherit' });
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
  if (DRY_RUN) {
    console.log(`  [dry-run] Upload ${zipPath} → SAS URL`);
    return;
  }
  if (!sasUrl) {
    console.warn('  No fileUploadUrl provided — skipping package upload');
    return;
  }

  const data = readFileSync(zipPath);
  console.log(`  Uploading ${(data.length / 1024 / 1024).toFixed(1)} MB to SAS URL...`);

  const res = await fetch(sasUrl, {
    method: 'PUT',
    headers: {
      'x-ms-blob-type': 'BlockBlob',
      'Content-Type': 'application/zip',
      'Content-Length': String(data.length),
    },
    body: data,
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
    console.log(`  commitStatus: ${sub.commitStatus}`);

    if (sub.commitStatus !== 'CommitStarted') {
      return sub;
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`Submission polling timed out after ${POLL_TIMEOUT_MS / 1000}s`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Validate environment
  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET || !APP_ID) {
    throw new Error(
      'Missing required environment variables: ' +
        'MSSTORE_TENANT_ID, MSSTORE_CLIENT_ID, MSSTORE_CLIENT_SECRET, STORE_PRODUCT_ID',
    );
  }

  if (DRY_RUN) {
    console.log('=== DRY RUN MODE — no mutations will be made ===\n');
  }

  // --- Step 1: Read listing content ---
  console.log('Reading store listing content...');
  const description = readListingFile('description.md');
  const shortDescription = readListingFile('short-description.md');
  const featuresMarkdown = readListingFile('features.md');
  const releaseNotes = readListingFile('release-notes.md');
  const features = parseBulletList(featuresMarkdown);

  console.log(`  description:      ${description.length} chars`);
  console.log(`  shortDescription: ${shortDescription.length} chars`);
  console.log(`  features:         ${features.length} items`);
  console.log(`  releaseNotes:     ${releaseNotes.length} chars`);

  // --- Step 2: Authenticate ---
  console.log('\nAuthenticating with Azure AD...');
  const token = await getAccessToken();
  console.log('  OK');

  // --- Step 3: Get app info ---
  console.log(`\nFetching app info for ${APP_ID}...`);
  const app = await apiGet(token, `/applications/${APP_ID}`);

  // Delete any existing pending submission to start fresh
  if (app.pendingApplicationSubmission?.id) {
    const pendingId = app.pendingApplicationSubmission.id;
    console.log(`  Deleting existing pending submission: ${pendingId}`);
    await apiDelete(token, `/applications/${APP_ID}/submissions/${pendingId}`);
  }

  // --- Step 4: Create new submission ---
  console.log('\nCreating new submission...');
  const newSub = await apiPost(token, `/applications/${APP_ID}/submissions`, null);
  const submissionId = newSub.id;
  const fileUploadUrl = newSub.fileUploadUrl;
  console.log(`  Submission ID: ${submissionId}`);

  // --- Step 5: Get full submission details ---
  console.log('\nGetting submission details...');
  const submission = DRY_RUN
    ? { listings: {}, applicationPackages: [] }
    : await apiGet(token, `/applications/${APP_ID}/submissions/${submissionId}`);

  // --- Step 6: Update listing ---
  console.log('\nUpdating store listing (ja-JP)...');
  if (!submission.listings) submission.listings = {};
  if (!submission.listings['ja-jp']) {
    submission.listings['ja-jp'] = { baseListing: {} };
  }

  const listing = submission.listings['ja-jp'].baseListing;
  listing.description = description;
  listing.shortDescription = shortDescription;
  listing.features = features;
  listing.releaseNotes = releaseNotes;

  // --- Step 7: Set application packages ---
  const appxFiles = DRY_RUN ? ['example.appx'] : findAppxFiles();
  console.log(`\nPackages to submit: ${appxFiles.join(', ')}`);

  submission.applicationPackages = appxFiles.map((fileName) => ({
    fileName,
    fileStatus: 'PendingUpload',
    minimumDirectXVersion: 'None',
    minimumSystemRam: 'None',
  }));

  // --- Step 8: PUT updated submission ---
  console.log('\nSaving submission changes...');
  await apiPut(token, `/applications/${APP_ID}/submissions/${submissionId}`, submission);

  // --- Step 9: Upload packages ---
  console.log('\nPreparing package ZIP...');
  const zipPath = createPackageZip();
  console.log('\nUploading packages to Azure Blob Storage...');
  await uploadPackageToSas(fileUploadUrl, zipPath);

  // --- Step 10: Commit ---
  console.log('\nCommitting submission...');
  await apiPost(token, `/applications/${APP_ID}/submissions/${submissionId}/commit`, null);

  // --- Step 11: Poll ---
  console.log('\nPolling submission status...');
  const finalSubmission = DRY_RUN
    ? { commitStatus: 'CommitStarted (dry-run)' }
    : await pollSubmissionStatus(token, submissionId);

  console.log(`\nFinal status: ${finalSubmission.commitStatus}`);

  if (finalSubmission.commitStatus === 'CommitFailed') {
    throw new Error(`Submission commit failed: ${JSON.stringify(finalSubmission.statusDetails)}`);
  }

  console.log('\nStore submission completed successfully.');
}

main().catch((err) => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});

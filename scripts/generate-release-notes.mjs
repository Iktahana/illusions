#!/usr/bin/env node
/**
 * Generates Japanese Microsoft Store release notes using GitHub Models API.
 *
 * Usage:
 *   node scripts/generate-release-notes.mjs \
 *     --to   <tag>     Current release tag (required)
 *     --from <tag>     Previous release tag (auto-detected if omitted)
 *     --out  <path>    Output file path (default: store/microsoft/ja-JP/release-notes.md)
 *     --dry-run        Print prompt and response without writing file
 *
 * Environment variables:
 *   GITHUB_TOKEN          - Used for GitHub Models API and gh CLI calls
 *   GITHUB_REPOSITORY     - owner/repo (auto-set in GitHub Actions)
 *   RELEASE_NOTES_MODEL   - AI model name (default: gpt-4o-mini)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const TEMPLATE_PATH = resolve(REPO_ROOT, 'store/microsoft/ja-JP/release-note-template.md');
const DEFAULT_OUT = resolve(REPO_ROOT, 'store/microsoft/ja-JP/release-notes.md');
const FALLBACK = '動作の安定性を向上しました';
const MAX_CHARS = 500;
const MAX_PRS = 10;

// --- Argument parsing ---
const args = process.argv.slice(2);
let toTag = null;
let fromTag = null;
let outPath = DEFAULT_OUT;
let dryRun = false;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--to':   toTag   = args[++i]; break;
    case '--from': fromTag = args[++i]; break;
    case '--out':  outPath = resolve(args[++i]); break;
    case '--dry-run': dryRun = true; break;
    default:
      console.error(`Unknown argument: ${args[i]}`);
      process.exit(1);
  }
}

if (!toTag) {
  console.error('Error: --to <tag> is required');
  process.exit(1);
}

// --- Resolve fromTag if not provided ---
if (!fromTag) {
  try {
    fromTag = execSync(`git describe --abbrev=0 --tags "${toTag}^"`, { encoding: 'utf8' }).trim();
    console.log(`Auto-detected previous tag: ${fromTag}`);
  } catch {
    console.log('No previous tag found — using last 30 commits.');
  }
}

// --- Collect commits ---
const logCmd = fromTag
  ? `git log "${fromTag}..${toTag}" --oneline --no-merges`
  : `git log "${toTag}" --oneline --no-merges --max-count=30`;

let commits = '';
try {
  commits = execSync(logCmd, { encoding: 'utf8' }).trim();
} catch (err) {
  console.warn('Failed to get git log:', err.message);
}

if (!commits) {
  console.log('No commits found. Using fallback text.');
  writeOutput(FALLBACK, outPath, dryRun);
  process.exit(0);
}

// --- Collect PR summaries ---
const prNumbers = [...new Set(
  [...commits.matchAll(/\(#(\d+)\)/g)].map(m => m[1])
)].slice(0, MAX_PRS);

const prSummaries = [];
const repo = process.env.GITHUB_REPOSITORY;

for (const num of prNumbers) {
  try {
    const repoFlag = repo ? `--repo "${repo}"` : '';
    const json = execSync(`gh pr view ${num} ${repoFlag} --json title,body`, { encoding: 'utf8' });
    const { title, body } = JSON.parse(json);
    const cleanedBody = cleanPrBody(body ?? '');
    prSummaries.push({ num, title, body: cleanedBody });
  } catch {
    // gh CLI unavailable or PR not found — skip
  }
}

// --- Build prompt ---
const templateContent = readFileSync(TEMPLATE_PATH, 'utf-8');
const userPrompt = buildUserPrompt(toTag, fromTag, commits, prSummaries);

if (dryRun) {
  console.log('\n=== SYSTEM PROMPT ===');
  console.log(templateContent);
  console.log('\n=== USER PROMPT ===');
  console.log(userPrompt);
}

// --- Call GitHub Models API ---
const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.warn('GITHUB_TOKEN not set. Using fallback text.');
  writeOutput(FALLBACK, outPath, dryRun);
  process.exit(0);
}

let result = FALLBACK;
try {
  const model = process.env.RELEASE_NOTES_MODEL ?? 'gpt-4o-mini';
  console.log(`Calling GitHub Models API (model: ${model})...`);

  const response = await fetch('https://models.inference.ai.azure.com/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 300,
      messages: [
        { role: 'system', content: templateContent },
        { role: 'user',   content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.warn(`API error ${response.status}: ${text}`);
    console.warn('Using fallback text.');
  } else {
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content?.trim() ?? '';
    if (text) {
      result = truncateToLimit(text, MAX_CHARS);
      console.log('AI generation succeeded.');
    } else {
      console.warn('Empty AI response. Using fallback text.');
    }
  }
} catch (err) {
  console.warn('API call failed:', err.message);
  console.warn('Using fallback text.');
}

if (dryRun) {
  console.log('\n=== OUTPUT ===');
  console.log(result);
  console.log('\n(dry-run: file not written)');
} else {
  writeOutput(result, outPath, false);
}

// --- Helpers ---

function writeOutput(text, path, isDryRun) {
  if (isDryRun) return;
  writeFileSync(path, text, 'utf-8');
  console.log(`Written to: ${path}`);
}

function truncateToLimit(text, maxChars) {
  if (text.length <= maxChars) return text;
  // Trim to last complete bullet point under the limit
  const lines = text.split('\n');
  let result = '';
  for (const line of lines) {
    const candidate = result ? result + '\n' + line : line;
    if (candidate.length > maxChars) break;
    result = candidate;
  }
  return result || text.slice(0, maxChars);
}

function cleanPrBody(body) {
  // Remove boilerplate lines
  const boilerplatePatterns = [
    /🤖 Generated with/i,
    /Co-Authored-By:/i,
    /^##\s*(Test plan|テスト計画)/im,
  ];
  const lines = body.split('\n');
  const cutIdx = lines.findIndex(l => boilerplatePatterns.some(p => p.test(l)));
  const cleaned = (cutIdx >= 0 ? lines.slice(0, cutIdx) : lines)
    .join('\n')
    .trim();
  // Return first 300 chars to keep prompt manageable
  return cleaned.slice(0, 300);
}

function buildUserPrompt(toTag, fromTag, commits, prSummaries) {
  const range = fromTag
    ? `前バージョン: ${fromTag} → 現バージョン: ${toTag}`
    : `初回リリース: ${toTag}`;

  let prompt = `バージョン ${toTag} のリリースノートを生成してください（${range}）。\n\n`;

  prompt += `## コミット一覧（マージコミット除く）\n\n${commits}\n\n`;

  if (prSummaries.length > 0) {
    prompt += '## 関連 PR の概要\n\n';
    for (const { num, title, body } of prSummaries) {
      prompt += `### PR #${num}: ${title}\n`;
      if (body) prompt += `> ${body.replace(/\n/g, '\n> ')}\n`;
      prompt += '\n';
    }
  }

  prompt += '---\n上記の変更から、エンドユーザーに関係する内容のみを抽出し、スタイルガイドに従って日本語のリリースノートを生成してください。';
  return prompt;
}

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutputDirectory = path.join(projectRoot, "out");

const forbiddenRoutes = [
  { pattern: /^api\/auth(?:\/|$|\.(?:html|txt|json)$)/, reason: "Web authentication route" },
  { pattern: /^api\/nlp(?:\/|$|\.(?:html|txt|json)$)/, reason: "Web NLP route" },
  {
    pattern: /^auth\/callback(?:\/|$|\.(?:html|txt|json)$)/,
    reason: "Web authentication callback route",
  },
  { pattern: /^~offline(?:\/|$|\.(?:html|txt|json)$)/, reason: "PWA offline route" },
];

const generatedServiceWorkerPattern = /^(?:sw\.js|swe-worker-[^/]+\.js)(?:\.map)?$/;

/**
 * Convert a relative artifact path from either host platform to a stable form.
 */
export function normalizeArtifactPath(artifactPath) {
  return artifactPath
    .replaceAll("\\", "/")
    .replace(/^(?:\.\/)+/, "")
    .replace(/\/+/g, "/");
}

/**
 * Return why an output entry is forbidden, or null when it is safe to package.
 */
export function classifyForbiddenArtifact(artifactPath) {
  const normalizedPath = normalizeArtifactPath(artifactPath);

  for (const route of forbiddenRoutes) {
    if (route.pattern.test(normalizedPath)) return route.reason;
  }

  if (path.posix.basename(normalizedPath).toLowerCase().endsWith(".webmanifest")) {
    return "Web app manifest";
  }
  if (generatedServiceWorkerPattern.test(normalizedPath)) return "generated service worker";

  return null;
}

function compareNames(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Inspect an Electron static-export directory without following symbolic links.
 *
 * Forbidden directories are reported once at their root instead of returning
 * every generated file below them.
 */
export function findForbiddenElectronArtifacts(outputDirectory = defaultOutputDirectory) {
  const absoluteOutputDirectory = path.resolve(outputDirectory);
  let outputStat;

  try {
    outputStat = fs.lstatSync(absoluteOutputDirectory);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Electron output directory does not exist: ${absoluteOutputDirectory}`);
    }
    throw error;
  }

  if (outputStat.isSymbolicLink()) {
    throw new Error(`Electron output path must not be a symbolic link: ${absoluteOutputDirectory}`);
  }

  if (!outputStat.isDirectory()) {
    throw new Error(`Electron output path is not a directory: ${absoluteOutputDirectory}`);
  }

  const findings = [];
  const pending = [{ absolutePath: absoluteOutputDirectory, relativePath: "" }];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;

    const entries = fs
      .readdirSync(current.absolutePath, { withFileTypes: true })
      .sort((left, right) => compareNames(left.name, right.name));

    for (const entry of entries) {
      const relativePath = normalizeArtifactPath(
        current.relativePath ? `${current.relativePath}/${entry.name}` : entry.name,
      );

      if (entry.isSymbolicLink()) {
        findings.push({ relativePath, reason: "symbolic link is unsupported" });
        continue;
      }

      const reason = classifyForbiddenArtifact(relativePath);

      if (reason) {
        findings.push({ relativePath, reason });
        continue;
      }

      if (entry.isDirectory()) {
        pending.push({
          absolutePath: path.join(current.absolutePath, entry.name),
          relativePath,
        });
      }
    }
  }

  return findings.sort((left, right) => compareNames(left.relativePath, right.relativePath));
}

function run() {
  const outputDirectory = process.argv[2] ?? defaultOutputDirectory;

  try {
    const findings = findForbiddenElectronArtifacts(outputDirectory);
    if (findings.length === 0) {
      console.log(`Electron artifacts valid: ${path.resolve(outputDirectory)}`);
      return;
    }

    console.error(
      `Electron output contains ${findings.length} forbidden Web artifact${
        findings.length === 1 ? "" : "s"
      }:`,
    );
    for (const finding of findings) {
      console.error(`- ${finding.relativePath} — ${finding.reason}`);
    }
    process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

function isMainModule(entryPath) {
  if (!entryPath) return false;

  try {
    return fs.realpathSync(entryPath) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule(process.argv[1])) {
  run();
}

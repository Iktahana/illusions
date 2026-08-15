import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const stylesDir = join(root, "src/styles");

async function filesIn(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? filesIn(join(dir, entry.name))
          : entry.name.endsWith(".css")
            ? [join(dir, entry.name)]
            : [],
      ),
    )
  ).flat();
}

const entry = await readFile(join(root, "src/app/globals.css"), "utf8");
const requiredImports = [
  "tokens.css",
  "base.css",
  "animations.css",
  "controls.css",
  "features/",
  "integrations/",
];
for (const required of requiredImports) {
  if (!entry.includes(required)) throw new Error(`globals.css must import ${required}`);
}

const cssFiles = await filesIn(stylesDir);
for (const file of cssFiles) {
  const css = await readFile(file, "utf8");
  if (css.includes("!important"))
    throw new Error(`Hand-written CSS must not use !important: ${file}`);
}

const inspector = await readFile(join(stylesDir, "features/inspector.css"), "utf8");
if (inspector.includes("space-y-") || inspector.includes("grid-cols-")) {
  throw new Error(
    "Inspector styles must use semantic data attributes, not Tailwind implementation classes",
  );
}

const typography = await readFile(join(root, "src/app/editor-typography.css"), "utf8");
const integrations = await readFile(join(stylesDir, "integrations/milkdown.css"), "utf8");
if (!typography.includes(".editor-core") || integrations.includes(".milkdown h1")) {
  throw new Error("Milkdown typography must have one application-owned, editor-core-scoped source");
}

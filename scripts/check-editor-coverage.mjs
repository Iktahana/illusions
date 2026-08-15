import { readFile } from "node:fs/promises";

const summaryPath = process.argv[2] ?? "coverage/coverage-summary.json";
const summary = JSON.parse(await readFile(summaryPath, "utf8"));
const required = [
  {
    label: "src/lib/editor-interaction/**/*",
    pattern: /\/src\/lib\/editor-interaction\//,
  },
  {
    label: "src/components/Editor.tsx",
    pattern: /\/src\/components\/Editor\.tsx$/,
  },
  {
    label: "src/components/editor/(MilkdownEditor|EditorToolbar|BubbleMenu|ValuePicker).tsx",
    pattern:
      /\/src\/components\/editor\/(MilkdownEditor|EditorToolbar|BubbleMenu|ValuePicker)\.tsx$/,
  },
  {
    label: "electron/lib/editor-command-registry.js",
    pattern: /\/electron\/lib\/editor-command-registry\.js$/,
  },
];
const thresholds = { statements: 85, lines: 85, functions: 85, branches: 75 };
const failures = [];
const files = Object.entries(summary).filter(([file]) => file !== "total");

for (const { label, pattern } of required) {
  const matches = files.filter(([file]) => pattern.test(file));
  if (matches.length === 0) {
    failures.push(`Missing coverage entry for ${label}`);
    continue;
  }
  for (const [file, metrics] of matches) {
    for (const [metric, minimum] of Object.entries(thresholds)) {
      const value = metrics[metric];
      if (!value) {
        failures.push(`${file}: missing metric ${metric}`);
        continue;
      }
      if (value.total > 0 && value.pct < minimum)
        failures.push(`${file}: ${metric} ${value.pct}% < ${minimum}%`);
    }
  }
}
if (failures.length) {
  console.error(`Editor interaction per-file coverage failed:\n${failures.join("\n")}`);
  process.exit(1);
}
console.log("Editor interaction per-file coverage thresholds passed.");

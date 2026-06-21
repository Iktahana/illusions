import nextConfig from "eslint-config-next";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const nodeGlobals = {
  __dirname: "readonly",
  __filename: "readonly",
  Buffer: "readonly",
  console: "readonly",
  exports: "writable",
  global: "readonly",
  module: "writable",
  process: "readonly",
  require: "readonly",
  setImmediate: "readonly",
  setInterval: "readonly",
  setTimeout: "readonly",
  clearInterval: "readonly",
  clearTimeout: "readonly",
  URL: "readonly",
};

/** @type {import("eslint").Linter.FlatConfig[]} */
const config = [
  ...nextConfig,
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-unused-expressions": "warn",
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
    },
  },
  {
    files: ["electron/**/*.js", "scripts/**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: nodeGlobals,
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      sourceType: "module",
      globals: nodeGlobals,
    },
  },
  {
    files: ["electron/**/*.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "dist-electron/**",
      "dist-main/**",
      "build/**",
      "coverage/**",
      "public/**",
    ],
  },
];

export default config;

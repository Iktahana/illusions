/**
 * Ruleset source adapters — INTERFACE ONLY (no IO/worker wiring yet).
 *
 * Defines the boundary between "where ruleset bytes come from" and the registry.
 * Two concrete adapters are planned for later phases:
 *   - folder    : `~/.illusions/rulesets/<id>/{manifest.json, index.js}` (Electron, dev)
 *   - container : a single `.illruleset` file (distribution / closed-source)
 * Built-in rulesets are statically imported and need no adapter.
 *
 * The crucial invariant: a manifest can always be read WITHOUT executing the
 * module code. For the container format this is guaranteed by a plaintext header.
 */
import type { RulesetManifest, RulesetModule } from "../sdk/ruleset-types";

export type RulesetSourceKind = "builtin" | "folder" | "container";

/** A ruleset discovered by an adapter, code not yet executed. */
export interface RawRuleset {
  id: string;
  source: RulesetSourceKind;
  /** Manifest parsed from plaintext (no code execution). */
  manifest: RulesetManifest;
  /** Module code as text (folder/container). Undefined for builtin. */
  code?: string;
  /** Statically imported module (builtin only). */
  module?: RulesetModule;
}

/** Discovers raw rulesets from some backing store without running their code. */
export interface RulesetSourceAdapter {
  readonly kind: RulesetSourceKind;
  /** List available rulesets (manifest + code text), without executing code. */
  list(): Promise<RawRuleset[]>;
}

/**
 * Plaintext header of the `.illruleset` single-file container format (reserved;
 * implemented in the distribution phase). The header is JSON, the payload that
 * follows it is the (possibly obfuscated / WASM) module code.
 */
export interface IllrulesetContainerHeader {
  magic: "ILLRULESET";
  /** Container format version (independent of engineApi). */
  containerVersion: number;
  manifest: RulesetManifest;
  payload: {
    kind: "js" | "wasm";
    encoding: "utf8" | "base64";
    /** Byte length of the payload that follows the header. */
    bytes: number;
  };
}

/**
 * Built-in (official) ruleset registry.
 *
 * illusions ships a curated list of first-party校正ルールセット that are
 * auto-downloaded from their GitHub Releases into `~/.illusions/rulesets/<id>/`
 * on launch (see electron/rulesets-manager.js). These are NOT bundled into the
 * app — they live in their own repos (1 repo = 1 ruleset) and are fetched so
 * they can be updated independently of the app release cycle.
 *
 * To add an official ruleset: publish a `v*` release in its repo (with
 * `index.js` + `manifest.json` assets, as the ruleset template's release.yml
 * does) and add an entry here.
 */

/** @typedef {{ id: string, owner: string, repo: string }} OfficialRuleset */

/** @type {ReadonlyArray<OfficialRuleset>} */
const OFFICIAL_RULESETS = Object.freeze([
  Object.freeze({
    id: "com.illusions-lab.gendai-kanazukai",
    owner: "illusions-lab",
    repo: "illusions-ruleset-gendai-kanazukai",
  }),
]);

module.exports = { OFFICIAL_RULESETS };

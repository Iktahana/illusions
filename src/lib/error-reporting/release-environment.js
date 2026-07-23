/**
 * Derive the GlitchTip environment from a SemVer release string.
 *
 * Stable releases go to `production`. For prereleases, the first prerelease
 * identifier becomes the environment, so new channels such as `rc`, `canary`,
 * or `preview` do not require a code change.
 */
function deriveReleaseEnvironment(release) {
  if (typeof release !== "string") return "production";

  const prerelease = release.trim().match(/^v?\d+(?:\.\d+){0,2}-([0-9A-Za-z]+)(?:[.-]|$)/);
  return prerelease?.[1]?.toLowerCase() || "production";
}

module.exports = { deriveReleaseEnvironment };

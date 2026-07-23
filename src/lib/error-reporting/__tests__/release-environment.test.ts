import { describe, expect, it } from "vitest";

import { deriveReleaseEnvironment } from "../release-environment";

describe("deriveReleaseEnvironment", () => {
  it.each([
    ["1.3.0", "production"],
    ["1.3.0-alpha.1", "alpha"],
    ["1.3.0-beta.20260708.1", "beta"],
    ["v1.3.0-rc.1", "rc"],
    ["1.3.0-canary.4", "canary"],
    [undefined, "production"],
  ])("derives %s as %s", (version, environment) => {
    expect(deriveReleaseEnvironment(version)).toBe(environment);
  });
});

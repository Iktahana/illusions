/**
 * Unit tests for the pure auto-update policy (#1782 / #1785).
 *
 * 要件の核: 「ベータ版アップデートを受け取る」ON のとき beta（プレリリース）を受信でき、
 * OFF のとき最新安定版へ戻る、という判定ロジックを電子依存なしで検証する。
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { resolveUpdaterFlags } = require("../update-policy") as {
  resolveUpdaterFlags: (v: unknown) => { allowPrerelease: boolean; allowDowngrade: boolean };
};

describe("resolveUpdaterFlags", () => {
  it("beta ON → プレリリース受信、ダウングレード不可", () => {
    expect(resolveUpdaterFlags(true)).toEqual({
      allowPrerelease: true,
      allowDowngrade: false,
    });
  });

  it("beta OFF → 安定版のみ、最新安定版へ戻すため downgrade 許可", () => {
    expect(resolveUpdaterFlags(false)).toEqual({
      allowPrerelease: false,
      allowDowngrade: true,
    });
  });

  it.each([undefined, null, 0, "", "true", 1, {}])(
    "真偽値 true 以外 (%s) は安全側 = beta OFF 扱い",
    (value) => {
      expect(resolveUpdaterFlags(value)).toEqual({
        allowPrerelease: false,
        allowDowngrade: true,
      });
    },
  );

  it("allowPrerelease と allowDowngrade は常に相反する（同時に true/ false にならない）", () => {
    for (const v of [true, false, undefined, "x"]) {
      const { allowPrerelease, allowDowngrade } = resolveUpdaterFlags(v);
      expect(allowPrerelease).toBe(!allowDowngrade);
    }
  });
});

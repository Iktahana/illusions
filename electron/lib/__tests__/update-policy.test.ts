/**
 * Unit tests for the pure auto-update policy (#1782 / #1785).
 *
 * 要件の核: 「ベータ版アップデートを受け取る」ON のとき beta（プレリリース）を受信でき、
 * OFF のとき最新安定版へ戻る、という判定ロジックを電子依存なしで検証する。
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { resolveUpdaterFlags, isUnpublishedChannelVersion } = require("../update-policy") as {
  resolveUpdaterFlags: (v: unknown) => { allowPrerelease: boolean; allowDowngrade: boolean };
  isUnpublishedChannelVersion: (v: unknown) => boolean;
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

describe("isUnpublishedChannelVersion", () => {
  it.each(["1.2.20-dev", "0.1.0-dev", "10.20.30-alpha", "1.2.20-alpha"])(
    "dev/alpha チャンネルのビルド (%s) は true（公開 Release が無く更新先が無い）",
    (version) => {
      expect(isUnpublishedChannelVersion(version)).toBe(true);
    },
  );

  it.each([
    "1.2.20", // 安定版
    "1.2.20-beta.20260620.162756", // beta は公開フィードを持つので対象外
    "1.2.20-beta.20260619.45436",
  ])("安定版/beta (%s) は false（更新を継続する）", (version) => {
    expect(isUnpublishedChannelVersion(version)).toBe(false);
  });

  it.each([undefined, null, 0, {}, [], 1.22])(
    "文字列以外 (%s) は安全側 = false（更新を止めない）",
    (value) => {
      expect(isUnpublishedChannelVersion(value)).toBe(false);
    },
  );

  it("'develop' のような部分一致では誤検出しない（ハイフン区切りのチャンネル接尾辞のみ）", () => {
    expect(isUnpublishedChannelVersion("1.2.20-developer")).toBe(false);
    expect(isUnpublishedChannelVersion("1.2.20-alphabet")).toBe(false);
  });
});

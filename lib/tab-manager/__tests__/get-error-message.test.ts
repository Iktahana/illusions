/**
 * getErrorMessage / isQuotaExceededError の挙動テスト。
 *
 * 目的は2つ:
 * 1. consistency — 既存の Node `ErrnoException` 分岐（EACCES/ENOSPC/...）の
 *    メッセージを「現行の正しい挙動」として固定し、リファクタで退行させない。
 * 2. new (#1967) — Web の `QuotaExceededError`（`DOMException`）を専用メッセージへ
 *    マッピングする新分岐を検証する。`DOMException` は環境によって
 *    `instanceof Error` が false になるため、その場合でも判定できることを保証する。
 */

import { describe, it, expect } from "vitest";
import { getErrorMessage, isQuotaExceededError } from "../types";

function errnoError(code: string, message = "boom"): Error {
  const e = new Error(message) as NodeJS.ErrnoException;
  e.code = code;
  return e;
}

describe("getErrorMessage — consistency (既存 Errno 分岐の固定)", () => {
  it("Error 以外（文字列 / null / 数値 / name を持たないオブジェクト）は『不明なエラー』", () => {
    expect(getErrorMessage("boom")).toBe("不明なエラー");
    expect(getErrorMessage(null)).toBe("不明なエラー");
    expect(getErrorMessage(42)).toBe("不明なエラー");
    expect(getErrorMessage({ foo: "bar" })).toBe("不明なエラー");
  });

  it("code の無い Error は message をそのまま返す", () => {
    expect(getErrorMessage(new Error("そのまま"))).toBe("そのまま");
  });

  it("EACCES / EPERM は権限エラーメッセージ", () => {
    const expected =
      "ファイルへのアクセス権限がありません。ファイルが他のプログラムで開かれていないか、または書き込み権限があるかを確認してください。";
    expect(getErrorMessage(errnoError("EACCES"))).toBe(expected);
    expect(getErrorMessage(errnoError("EPERM"))).toBe(expected);
  });

  it("ENOSPC は容量不足メッセージ", () => {
    expect(getErrorMessage(errnoError("ENOSPC"))).toBe("ディスクの空き容量が不足しています。");
  });

  it("ENOENT は保存先フォルダ不明メッセージ", () => {
    expect(getErrorMessage(errnoError("ENOENT"))).toBe("保存先のフォルダが見つかりません。");
  });

  it("EINVAL は無効パスメッセージ", () => {
    expect(getErrorMessage(errnoError("EINVAL"))).toBe(
      "ファイル名またはパスが無効です。使用できない文字が含まれている可能性があります。",
    );
  });

  it("ENAMETOOLONG は名前過長メッセージ", () => {
    expect(getErrorMessage(errnoError("ENAMETOOLONG"))).toBe("ファイル名またはパスが長すぎます。");
  });

  it("未知の code は message にフォールバック", () => {
    expect(getErrorMessage(errnoError("EUNKNOWNXYZ", "原文メッセージ"))).toBe("原文メッセージ");
  });
});

describe("getErrorMessage — #1967 QuotaExceededError 新分岐", () => {
  const QUOTA_MSG =
    "保存容量が不足しています。不要なデータを削除するか、別の保存先をご利用ください。";

  it("実 DOMException(QuotaExceededError) を容量メッセージへマップ", () => {
    const e = new DOMException("quota", "QuotaExceededError");
    expect(getErrorMessage(e)).toBe(QUOTA_MSG);
  });

  it("instanceof Error をすり抜ける duck-typed {name:'QuotaExceededError'} も判定", () => {
    expect(getErrorMessage({ name: "QuotaExceededError", message: "x" })).toBe(QUOTA_MSG);
  });

  it("legacy Firefox の NS_ERROR_DOM_QUOTA_REACHED も判定", () => {
    expect(getErrorMessage({ name: "NS_ERROR_DOM_QUOTA_REACHED" })).toBe(QUOTA_MSG);
  });

  it("旧仕様の数値コード 22 も判定", () => {
    expect(getErrorMessage({ code: 22 })).toBe(QUOTA_MSG);
  });

  it("quota は ENOSPC より優先しないが、両者が独立に容量系メッセージを返す", () => {
    // ENOSPC（Electron 経路）と QuotaExceeded（Web 経路）は別メッセージだが
    // どちらも「容量不足」をユーザーへ伝える。退行検知のため両方を固定。
    expect(getErrorMessage(errnoError("ENOSPC"))).toContain("空き容量");
    expect(getErrorMessage(new DOMException("q", "QuotaExceededError"))).toContain("容量");
  });
});

describe("isQuotaExceededError", () => {
  it("quota 系は true", () => {
    expect(isQuotaExceededError(new DOMException("q", "QuotaExceededError"))).toBe(true);
    expect(isQuotaExceededError({ name: "QuotaExceededError" })).toBe(true);
    expect(isQuotaExceededError({ name: "NS_ERROR_DOM_QUOTA_REACHED" })).toBe(true);
    expect(isQuotaExceededError({ code: 22 })).toBe(true);
  });

  it("非 quota は false", () => {
    expect(isQuotaExceededError(new Error("boom"))).toBe(false);
    expect(isQuotaExceededError(errnoError("ENOSPC"))).toBe(false);
    expect(isQuotaExceededError(null)).toBe(false);
    expect(isQuotaExceededError("QuotaExceededError")).toBe(false);
    expect(isQuotaExceededError({ code: 23 })).toBe(false);
  });
});

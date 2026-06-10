/**
 * Tests for the external-URL open policy (#1567 S3).
 *
 * window-manager.js setWindowOpenHandler previously passed any URL matching
 * url.startsWith("http") to shell.openExternal. isSafeExternalUrl() must
 * allow ONLY strictly-parsed http(s) URLs and fail closed on everything
 * else (other schemes, parse failures, non-strings).
 */

import { describe, it, expect } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { isSafeExternalUrl } = require("../../../electron/lib/url-policy") as {
  isSafeExternalUrl: (url: unknown) => boolean;
};

describe("isSafeExternalUrl()", () => {
  it("normalizes opaque special-scheme forms per WHATWG (http:evil.com is a web URL)", () => {
    // WHATWG URL force-normalizes special schemes: "http:evil.com" parses as
    // "http://evil.com/" — a genuine hierarchical web URL, allowed by design.
    expect(isSafeExternalUrl("http:evil.com")).toBe(true);
    // Authority-less forms fail to parse at all -> denied (fail closed).
    expect(isSafeExternalUrl("http://")).toBe(false);
    expect(isSafeExternalUrl("https:")).toBe(false);
  });

  it("allows a plain https URL", () => {
    expect(isSafeExternalUrl("https://illusions.app/")).toBe(true);
  });

  it("allows a plain http URL", () => {
    expect(isSafeExternalUrl("http://localhost:3000/docs")).toBe(true);
  });

  it("allows https URLs with query/fragment/userinfo noise", () => {
    expect(isSafeExternalUrl("https://example.com/path?q=1#frag")).toBe(true);
  });

  it("denies file: URLs", () => {
    expect(isSafeExternalUrl("file:///etc/passwd")).toBe(false);
  });

  it("denies smb: URLs", () => {
    expect(isSafeExternalUrl("smb://attacker.example/share")).toBe(false);
  });

  it("denies javascript: URLs", () => {
    // eslint-disable-next-line no-script-url
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
  });

  it("denies custom app schemes", () => {
    expect(isSafeExternalUrl("ms-msdt:/id PCWDiagnostic")).toBe(false);
    expect(isSafeExternalUrl("vscode://open?url=x")).toBe(false);
  });

  it("denies scheme-smuggling via http prefix (httpx:, https+evil:)", () => {
    // These pass a naive startsWith("http") check but are NOT web URLs
    expect(isSafeExternalUrl("httpx://evil.example/")).toBe(false);
    expect(isSafeExternalUrl("https+evil://evil.example/")).toBe(false);
  });

  it("fails closed on unparseable URLs", () => {
    expect(isSafeExternalUrl("https://")).toBe(false);
    expect(isSafeExternalUrl("not a url")).toBe(false);
    expect(isSafeExternalUrl("")).toBe(false);
  });

  it("fails closed on non-string input", () => {
    expect(isSafeExternalUrl(undefined)).toBe(false);
    expect(isSafeExternalUrl(null)).toBe(false);
    expect(isSafeExternalUrl(42)).toBe(false);
    expect(isSafeExternalUrl({ href: "https://example.com" })).toBe(false);
  });

  it("denies protocol-relative and schemeless strings", () => {
    expect(isSafeExternalUrl("//example.com/path")).toBe(false);
    expect(isSafeExternalUrl("example.com")).toBe(false);
  });
});

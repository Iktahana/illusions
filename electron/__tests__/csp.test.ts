import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const mainSrc = fs.readFileSync(path.resolve(__dirname, "../main.js"), "utf8");

describe("main.js CSP (drift guard)", () => {
  it("allows required remote APIs and the local Ollama endpoints in connect-src", () => {
    const connectSrcLine = mainSrc.split("\n").find((line) => line.includes("connect-src"));

    expect(connectSrcLine).toContain("https://bug-report.api.illusions.app");
    expect(connectSrcLine).toContain("http://localhost:11434");
    expect(connectSrcLine).toContain("http://127.0.0.1:11434");
  });
});

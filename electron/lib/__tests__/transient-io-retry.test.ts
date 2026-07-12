import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { isTransientIoError, withTransientIoRetry, withTransientIoRetrySync } =
  require("../transient-io-retry.js") as {
    isTransientIoError: (error: unknown) => boolean;
    withTransientIoRetry: <T>(
      operation: () => Promise<T>,
      options?: { retries?: number; baseDelayMs?: number },
    ) => Promise<T>;
    withTransientIoRetrySync: <T>(
      operation: () => T,
      options?: { retries?: number; baseDelayMs?: number },
    ) => T;
  };

function codedError(code: string): Error & { code: string } {
  const error = new Error(code) as Error & { code: string };
  error.code = code;
  return error;
}

describe("transient IO retry helper", () => {
  it("classifies Windows transient file-lock errors", () => {
    expect(isTransientIoError(codedError("EPERM"))).toBe(true);
    expect(isTransientIoError(codedError("EBUSY"))).toBe(true);
    expect(isTransientIoError(codedError("ENOTEMPTY"))).toBe(true);
    expect(isTransientIoError(codedError("EACCES"))).toBe(true);
    expect(isTransientIoError(codedError("ENOENT"))).toBe(false);
  });

  it("retries a transient failure before succeeding", async () => {
    const operation = vi.fn(async () => {
      if (operation.mock.calls.length === 1) throw codedError("EPERM");
      return "ok";
    });

    await expect(withTransientIoRetry(operation, { baseDelayMs: 0 })).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-transient errors", async () => {
    const error = codedError("ENOENT");
    const operation = vi.fn(async () => {
      throw error;
    });

    await expect(withTransientIoRetry(operation, { baseDelayMs: 0 })).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("retries synchronously for sync filesystem swaps", () => {
    const operation = vi.fn(() => {
      if (operation.mock.calls.length === 1) throw codedError("EBUSY");
      return "ok";
    });

    expect(withTransientIoRetrySync(operation, { baseDelayMs: 0 })).toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });
});

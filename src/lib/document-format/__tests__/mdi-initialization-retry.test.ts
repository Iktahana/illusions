import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ initializeMdi: vi.fn<() => Promise<void>>() }));

vi.mock("@illusions-lab/milkdown-plugin-mdi", () => ({
  getMdi: vi.fn(() => vi.fn()),
  initializeMdi: mocks.initializeMdi,
  mdi: vi.fn(() => []),
}));

vi.mock("@illusions-lab/mdi", () => ({
  getMdiTextBlocks: vi.fn(() => ({ blocks: [], diagnostics: [] })),
  parse: vi.fn(() => ({ diagnostics: [] })),
}));

describe("MDI adapter initialization", () => {
  beforeEach(() => {
    mocks.initializeMdi.mockReset();
  });

  it("clears a rejected initialization promise so startup can retry", async () => {
    mocks.initializeMdi
      .mockRejectedValueOnce(new Error("temporary fetch failure"))
      .mockResolvedValueOnce(undefined);

    const { getDocumentAdapter } = await import("@/lib/document-format");
    const adapter = getDocumentAdapter("mdi");

    await expect(adapter.initialize()).rejects.toThrow("temporary fetch failure");
    await expect(adapter.initialize()).resolves.toBeUndefined();
    expect(mocks.initializeMdi).toHaveBeenCalledTimes(2);
  });
});

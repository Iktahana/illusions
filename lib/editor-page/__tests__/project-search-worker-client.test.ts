import { describe, expect, it } from "vitest";

import {
  ProjectSearchWorkerClient,
  type ProjectSearchWorkerRequest,
  type ProjectSearchWorkerResponse,
} from "@/lib/editor-page/project-search-worker-client";

class FakeWorker {
  onmessage: ((event: MessageEvent<ProjectSearchWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly received: ProjectSearchWorkerRequest[] = [];
  terminated = false;

  postMessage(message: ProjectSearchWorkerRequest): void {
    this.received.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(message: ProjectSearchWorkerResponse): void {
    this.onmessage?.(new MessageEvent("message", { data: message }));
  }
}

describe("ProjectSearchWorkerClient", () => {
  it("matches a document through a worker round trip", async () => {
    const worker = new FakeWorker();
    const client = new ProjectSearchWorkerClient(() => worker as unknown as Worker);

    const pending = client.matchDocument("target", ".mdi", "target", {});
    expect(worker.received).toMatchObject([
      { type: "MATCH_DOCUMENT", id: 1, content: "target", fileType: ".mdi" },
    ]);

    worker.emit({
      type: "MATCH_RESULT",
      id: 1,
      result: {
        content: "target",
        matches: [{ from: 0, to: 6, rawFrom: 0, rawTo: 6, lineNumber: 1 }],
      },
    });

    await expect(pending).resolves.toMatchObject({ matches: [{ rawFrom: 0, rawTo: 6 }] });
    client.dispose();
    expect(worker.terminated).toBe(true);
  });

  it("rejects pending work when disposed", async () => {
    const worker = new FakeWorker();
    const client = new ProjectSearchWorkerClient(() => worker as unknown as Worker);
    const pending = client.matchDocument("target", ".mdi", "target", {});

    client.dispose();

    await expect(pending).rejects.toThrow("disposed");
  });

  it("falls back to synchronous matching after a worker crash", async () => {
    const worker = new FakeWorker();
    const client = new ProjectSearchWorkerClient(() => worker as unknown as Worker);
    const pending = client.matchDocument("first", ".mdi", "first", {});

    // Worker が起動失敗した際は保留中リクエストを同期で履行し、以降も同期モードへ移行する。
    worker.onerror?.(new ErrorEvent("error", { message: "worker failed to load" }));

    // pending request is fulfilled synchronously via findRawDocumentMatches
    await expect(pending).resolves.toMatchObject({
      matches: [expect.objectContaining({ source: "text", rawFrom: 0, rawTo: 5 })],
    });
    // subsequent requests also resolve synchronously without using the worker
    const afterCrash = client.matchDocument("second", ".mdi", "second", {});
    expect(worker.received).toHaveLength(1);
    await expect(afterCrash).resolves.toMatchObject({
      matches: [expect.objectContaining({ source: "text", rawFrom: 0, rawTo: 6 })],
    });
    expect(worker.terminated).toBe(true);
  });
});

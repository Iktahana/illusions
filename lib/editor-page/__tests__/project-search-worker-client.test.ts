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

  it("poisons the client after a worker crash", async () => {
    const worker = new FakeWorker();
    const client = new ProjectSearchWorkerClient(() => worker as unknown as Worker);
    const pending = client.matchDocument("first", ".mdi", "first", {});

    worker.onerror?.(new ErrorEvent("error", { message: "worker crashed" }));

    await expect(pending).rejects.toThrow("worker crashed");
    const afterCrash = client.matchDocument("second", ".mdi", "second", {});
    expect(worker.received).toHaveLength(1);
    await expect(afterCrash).rejects.toThrow("worker crashed");
    expect(worker.terminated).toBe(true);
  });
});

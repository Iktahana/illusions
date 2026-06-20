import type { SearchOptions } from "./find-search-matches";
import { findRawDocumentMatches } from "./project-search";
import type { ProjectDocumentMatcher, RawDocumentSearchResult } from "./project-search";

export interface ProjectSearchWorkerRequest {
  type: "MATCH_DOCUMENT";
  id: number;
  content: string;
  fileType: string;
  searchTerm: string;
  options: SearchOptions;
}

export type ProjectSearchWorkerResponse =
  | {
      type: "MATCH_RESULT";
      id: number;
      result: RawDocumentSearchResult;
    }
  | {
      type: "MATCH_ERROR";
      id: number;
      error: { name: string; message: string };
    };

export type ProjectSearchWorkerFactory = () => Worker;

const defaultWorkerFactory: ProjectSearchWorkerFactory = () =>
  new Worker(new URL("./project-search.worker.ts", import.meta.url), { type: "module" });

interface PendingMatch {
  content: string;
  fileType: string;
  searchTerm: string;
  options: SearchOptions;
  resolve: (result: RawDocumentSearchResult) => void;
  reject: (error: Error) => void;
}

export class ProjectSearchWorkerClient {
  private readonly worker: Worker;
  private readonly pending = new Map<number, PendingMatch>();
  private nextId = 1;
  private disposed = false;
  private useFallback = false;

  readonly matchDocument: ProjectDocumentMatcher = (content, fileType, searchTerm, options) => {
    // Worker が起動失敗した場合はメインスレッドの同期実装で処理する。
    if (this.useFallback) {
      return Promise.resolve(findRawDocumentMatches(content, fileType, searchTerm, options));
    }
    if (this.disposed) return Promise.reject(new Error("Project search worker is disposed"));

    const id = this.nextId++;
    const result = new Promise<RawDocumentSearchResult>((resolve, reject) => {
      this.pending.set(id, { content, fileType, searchTerm, options, resolve, reject });
    });
    this.worker.postMessage({
      type: "MATCH_DOCUMENT",
      id,
      content,
      fileType,
      searchTerm,
      options,
    } satisfies ProjectSearchWorkerRequest);
    return result;
  };

  constructor(factory: ProjectSearchWorkerFactory = defaultWorkerFactory) {
    this.worker = factory();
    this.worker.onmessage = (event: MessageEvent<ProjectSearchWorkerResponse>) => {
      const message = event.data;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);

      if (message.type === "MATCH_RESULT") {
        pending.resolve(message.result);
        return;
      }

      const error = new Error(message.error.message);
      error.name = message.error.name;
      pending.reject(error);
    };
    this.worker.onerror = () => {
      // Worker URL の解決失敗（Electron パッケージ版など）を検知したら同期モードへ切替。
      // 保留中のリクエストはメインスレッドで同期実行して履行する。
      this.useFallback = true;
      this.worker.terminate();
      const snapshot = new Map(this.pending);
      this.pending.clear();
      for (const [, item] of snapshot) {
        try {
          item.resolve(findRawDocumentMatches(item.content, item.fileType, item.searchTerm, item.options));
        } catch (error) {
          item.reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (!this.useFallback) {
      this.rejectAll(new Error("Project search worker is disposed"));
      this.worker.terminate();
    }
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

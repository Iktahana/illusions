/// <reference lib="webworker" />

import { findRawDocumentMatches } from "./project-search";
import type {
  ProjectSearchWorkerRequest,
  ProjectSearchWorkerResponse,
} from "./project-search-worker-client";

declare const self: DedicatedWorkerGlobalScope;

function post(message: ProjectSearchWorkerResponse): void {
  self.postMessage(message);
}

self.onmessage = (event: MessageEvent<ProjectSearchWorkerRequest>) => {
  const message = event.data;
  try {
    post({
      type: "MATCH_RESULT",
      id: message.id,
      result: findRawDocumentMatches(
        message.content,
        message.fileType,
        message.searchTerm,
        message.options,
      ),
    });
  } catch (error) {
    const cause = error instanceof Error ? error : new Error(String(error));
    post({
      type: "MATCH_ERROR",
      id: message.id,
      error: { name: cause.name, message: cause.message },
    });
  }
};

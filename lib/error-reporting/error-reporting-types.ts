export type RendererErrorSource =
  "error-boundary" | "window-error" | "unhandledrejection" | "csp-violation";

export interface RendererErrorPayload {
  source: RendererErrorSource;
  name?: string;
  message?: string;
  stack?: string;
  sectionName?: string;
}

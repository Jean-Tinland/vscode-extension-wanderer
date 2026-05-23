import type { ExtensionMessage, WebviewMessage } from "@shared/protocol";
import { isExtensionMessage } from "@shared/guards";

type VsCodeApi = {
  postMessage: (msg: WebviewMessage) => void;
  setState: (state: unknown) => void;
  getState: () => unknown;
};

declare function acquireVsCodeApi(): VsCodeApi;

let api: VsCodeApi | null = null;

function getVsCodeApi(): VsCodeApi {
  if (api) return api;
  if (typeof acquireVsCodeApi === "function") {
    api = acquireVsCodeApi();
    return api;
  }
  // Dev fallback when running in a plain browser via `vite dev`.
  api = {
    postMessage: (msg) => console.log("[webview→ext]", msg),
    setState: () => undefined,
    getState: () => undefined,
  };
  return api;
}

export function postToExtension(msg: WebviewMessage): void {
  getVsCodeApi().postMessage(msg);
}

export function readWebviewState<T>(): T | undefined {
  const state = getVsCodeApi().getState();
  if (state === null || state === undefined) return undefined;
  return state as T;
}

export function patchWebviewState(
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const current = readWebviewState<Record<string, unknown>>() ?? {};
  const next = { ...current, ...patch };
  getVsCodeApi().setState(next);
  return next;
}

type Listener = (msg: ExtensionMessage) => void;
const listeners = new Set<Listener>();

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (!isExtensionMessage(event.data)) {
    console.warn("[wanderer] Ignored malformed extension message", event.data);
    return;
  }
  for (const l of listeners) l(event.data);
});

export function onExtensionMessage(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function newRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
      "",
    );
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

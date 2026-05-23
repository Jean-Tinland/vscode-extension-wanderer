import type { EditorBufferSnapshot } from "@shared/protocol";
import {
  newRequestId,
  onExtensionMessage,
  postToExtension,
} from "../bridge/vscode";
import {
  resolveWebviewOpenRequest,
  trackWebviewOpenRequest,
} from "./openRequestTracker";

export interface FileContent {
  text: string;
  languageId: string;
  version: number;
  isDirty: boolean;
  needsHostSync: boolean;
}

const fileCache = new Map<string, FileContent>();
const pendingLoads = new Map<string, Promise<FileContent>>();
const restoredBuffers = new Map<string, EditorBufferSnapshot>();

export function getCachedFile(fileUri: string): FileContent | undefined {
  return fileCache.get(fileUri);
}

export function setCachedFile(fileUri: string, file: FileContent): void {
  fileCache.set(fileUri, file);
}

export function rememberLayoutBuffers(
  buffers?: Record<string, EditorBufferSnapshot>,
): void {
  restoredBuffers.clear();
  if (!buffers) return;
  for (const [fileUri, buffer] of Object.entries(buffers)) {
    // Only dirty buffers must override host-side content on restore.
    if (!buffer.isDirty) continue;
    restoredBuffers.set(fileUri, buffer);
  }
}

export function collectLayoutBuffers(
  fileUris: string[],
): Record<string, EditorBufferSnapshot> | undefined {
  const buffers: Record<string, EditorBufferSnapshot> = {};
  for (const fileUri of new Set(fileUris)) {
    const cached = fileCache.get(fileUri);
    if (!cached || !cached.isDirty) continue;
    buffers[fileUri] = {
      content: cached.text,
      languageId: cached.languageId,
      isDirty: true,
    };
  }
  return Object.keys(buffers).length > 0 ? buffers : undefined;
}

export function ensureFile(fileUri: string): Promise<FileContent> {
  const cached = fileCache.get(fileUri);
  if (cached) return Promise.resolve(cached);
  const inflight = pendingLoads.get(fileUri);
  if (inflight) return inflight;

  const requestId = newRequestId();
  const promise = new Promise<FileContent>((resolve, reject) => {
    const unsubscribe = onExtensionMessage((msg) => {
      if (msg.type === "openFileResult" && msg.requestId === requestId) {
        resolveWebviewOpenRequest(requestId);
        const restored = restoredBuffers.get(fileUri);
        const shouldRestore = restored?.isDirty === true;
        const fileContent: FileContent = {
          text: shouldRestore ? restored.content : msg.content,
          languageId: shouldRestore ? restored.languageId : msg.languageId,
          version: 0,
          isDirty: shouldRestore ? true : msg.isDirty,
          needsHostSync: shouldRestore && restored.content !== msg.content,
        };
        fileCache.set(fileUri, fileContent);
        restoredBuffers.delete(fileUri);
        pendingLoads.delete(fileUri);
        unsubscribe();
        resolve(fileContent);
      } else if (msg.type === "error" && msg.requestId === requestId) {
        resolveWebviewOpenRequest(requestId);
        pendingLoads.delete(fileUri);
        unsubscribe();
        reject(new Error(msg.message));
      }
    });

    trackWebviewOpenRequest(requestId);
    postToExtension({ type: "openFile", requestId, fileUri });
  });

  pendingLoads.set(fileUri, promise);
  return promise;
}

export function updateCachedFileFromHost(
  fileUri: string,
  content: string,
  version: number,
  isDirty: boolean,
): void {
  const cached = fileCache.get(fileUri);
  if (!cached) return;
  cached.text = content;
  cached.version = version;
  cached.isDirty = isDirty;
  cached.needsHostSync = false;
}

export function updateCachedFileFromModel(
  fileUri: string,
  content: string,
  version: number,
): void {
  const cached = fileCache.get(fileUri);
  if (!cached) return;
  cached.text = content;
  cached.version = version;
  cached.isDirty = true;
  cached.needsHostSync = false;
}

export function clearCachedFileNeedsHostSync(fileUri: string): void {
  const cached = fileCache.get(fileUri);
  if (!cached) return;
  cached.needsHostSync = false;
}
import * as monaco from "monaco-editor";
import { toMonacoLanguageId } from "./languageId";

/**
 * Cache of Monaco models keyed by file URI so multiple editor nodes pointing
 * at the same file share a single underlying buffer. Critical for performance
 * and to keep edits coherent across nodes.
 */
const models = new Map<string, monaco.editor.ITextModel>();
const modelRefCounts = new Map<string, number>();

/**
 * URIs currently being updated from the extension host.  Checked by
 * EditorNode's `onDidChangeModelContent` handler so that host-originated
 * model mutations are not echoed back as `applyDelta` messages (which would
 * corrupt the document by re-applying a stale rangeLength against the
 * already-updated host document).
 */
const hostUpdating = new Set<string>();

/** Returns `true` while `updateModel` is synchronously applying a host edit. */
export function isHostUpdate(uri: string): boolean {
  return hostUpdating.has(uri);
}

export function getOrCreateModel(
  uri: string,
  content: string,
  languageId: string,
): monaco.editor.ITextModel {
  const monacoLanguageId = toMonacoLanguageId(languageId);
  const existing = getModel(uri);
  if (existing) {
    if (existing.getLanguageId() !== monacoLanguageId) {
      monaco.editor.setModelLanguage(existing, monacoLanguageId);
    }
    if (existing.getValue() !== content) {
      existing.setValue(content);
    }
    return existing;
  }

  const model = monaco.editor.createModel(
    content,
    monacoLanguageId,
    monaco.Uri.parse(uri),
  );
  models.set(uri, model);
  return model;
}

/**
 * Retain a shared model for an editor instance. Must be paired with
 * `releaseModel` when that editor is disposed.
 */
export function retainModel(uri: string): void {
  modelRefCounts.set(uri, (modelRefCounts.get(uri) ?? 0) + 1);
}

/**
 * Release one editor reference to a shared model and dispose only when the
 * last consumer has gone away.
 */
export function releaseModel(uri: string): void {
  const count = modelRefCounts.get(uri) ?? 0;
  if (count > 1) {
    modelRefCounts.set(uri, count - 1);
    return;
  }

  modelRefCounts.delete(uri);

  const disposeIfOrphaned = () => {
    const model = getModel(uri);
    if (!model) return;
    if (model.isAttachedToEditor()) return;
    model.dispose();
    models.delete(uri);
    hostUpdating.delete(uri);
  };

  // Survive transient unmount/remount cycles by checking on the next frame.
  if (
    typeof window !== "undefined" &&
    typeof window.requestAnimationFrame === "function"
  ) {
    window.requestAnimationFrame(() => {
      disposeIfOrphaned();
    });
    return;
  }

  disposeIfOrphaned();
}

export function getModel(uri: string): monaco.editor.ITextModel | undefined {
  const model = models.get(uri);
  if (!model) return undefined;
  if (model.isDisposed()) {
    models.delete(uri);
    modelRefCounts.delete(uri);
    hostUpdating.delete(uri);
    return undefined;
  }
  return model;
}

export function updateModel(uri: string, content: string): void {
  const model = getModel(uri);
  if (!model) return;
  const current = model.getValue();
  if (current === content) return;
  // Flag this URI so EditorNode's onDidChangeModelContent handler skips the
  // echo – model.applyEdits fires listeners synchronously.
  hostUpdating.add(uri);
  try {
    // Use applyEdits (full-range replace) instead of setValue to preserve
    // cursor position and undo stack when the editor has focus.
    const fullRange = model.getFullModelRange();
    model.applyEdits([{ range: fullRange, text: content }]);
  } finally {
    hostUpdating.delete(uri);
  }
}

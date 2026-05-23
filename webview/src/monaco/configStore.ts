/**
 * Centralized Monaco editor-options store.
 *
 * Tracks every mounted standalone editor and rebroadcasts the merged option
 * set to all of them whenever new settings arrive from the extension host.
 * Replaces the `updateUserConfiguration` flow we previously used through the
 * `@codingame/monaco-vscode-api` configuration service.
 */
import type * as Monaco from "monaco-editor";

type EditorOptions = Monaco.editor.IEditorOptions &
  Monaco.editor.IGlobalEditorOptions;

const options: EditorOptions = {};
const editors = new Set<Monaco.editor.IStandaloneCodeEditor>();

/**
 * Merge `partial` into the accumulated option set and push to all known
 * editors. Deep-merges plain object children one level deep so nested keys
 * like `minimap` or `guides` are preserved across updates.
 */
export function mergeAndPush(partial: EditorOptions): void {
  for (const [key, value] of Object.entries(partial)) {
    const k = key as keyof EditorOptions;
    const current = options[k];
    if (isPlainObject(value) && isPlainObject(current as unknown)) {
      (options as Record<string, unknown>)[k] = {
        ...(current as Record<string, unknown>),
        ...(value as Record<string, unknown>),
      };
    } else {
      (options as Record<string, unknown>)[k] = value as unknown;
    }
  }
  for (const editor of editors) {
    editor.updateOptions(options);
  }
}

/** Snapshot of current options — used by newly created editors. */
export function getEditorOptions(): EditorOptions {
  return options;
}

/**
 * Register a standalone editor so it receives all future option updates.
 * Returns a disposer that unregisters the editor.
 */
export function registerEditor(
  editor: Monaco.editor.IStandaloneCodeEditor,
): () => void {
  editors.add(editor);
  editor.updateOptions(options);
  return () => {
    editors.delete(editor);
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

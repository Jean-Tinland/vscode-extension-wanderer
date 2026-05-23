/**
 * Registers Monaco hover + completion + inline completion providers that
 * proxy requests through the extension host via postMessage.
 */
import type * as Monaco from "monaco-editor";
import type { CompletionRangeData, RangeLike } from "@shared/protocol";
import {
  newRequestId,
  onExtensionMessage,
  postToExtension,
} from "../bridge/vscode";
import { useIntelligenceStore } from "../state/intelligenceStore";
import { toMonacoLanguageId } from "./languageId";

const registeredLanguages = new Set<string>();

/** Max context sent for inline completion FIM prompts. */
const MAX_PREFIX_CHARS = 3000;
const MAX_SUFFIX_CHARS = 1000;

/**
 * Ensure a completion + hover + inline completion provider is registered for
 * the given language. Only registers once per language – safe to call on
 * every mount.
 */
export function ensureLanguageProviders(
  monaco: typeof Monaco,
  languageId: string,
): void {
  const monacoLanguageId = toMonacoLanguageId(languageId);
  if (registeredLanguages.has(monacoLanguageId)) return;
  registeredLanguages.add(monacoLanguageId);

  monaco.languages.registerCompletionItemProvider(monacoLanguageId, {
    triggerCharacters: [".", "/", "<", '"', "'", "@", "#"],
    provideCompletionItems(model, position, context, token) {
      if (token.isCancellationRequested) {
        return { suggestions: [] };
      }

      const fileUri = model.uri.toString();
      const requestId = newRequestId();
      const word = model.getWordUntilPosition(position);
      const fallbackRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      return new Promise((resolve) => {
        let settled = false;
        let unsub: () => void = () => undefined;

        const timer = setTimeout(() => {
          useIntelligenceStore.getState().reportTimeout("completion", fileUri);
          postToExtension({ type: "cancelRequest", requestId });
          finish({ suggestions: [] });
        }, 5000);

        const onCancel = token.onCancellationRequested(() => {
          if (settled) return;
          postToExtension({ type: "cancelRequest", requestId });
          finish({ suggestions: [] });
        });

        function finish(result: Monaco.languages.CompletionList): void {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          onCancel.dispose();
          unsub();
          resolve(result);
        }

        unsub = onExtensionMessage((msg) => {
          if (msg.type === "completionResult" && msg.requestId === requestId) {
            useIntelligenceStore
              .getState()
              .reportSuccess("completion", fileUri);

            const suggestions: Monaco.languages.CompletionItem[] =
              msg.items.map((item) => ({
                label:
                  item.labelDetail !== undefined ||
                  item.labelDescription !== undefined
                    ? {
                        label: item.label,
                        detail: item.labelDetail,
                        description: item.labelDescription,
                      }
                    : item.label,
                kind: item.kind as Monaco.languages.CompletionItemKind,
                detail: item.detail,
                documentation: item.documentation,
                insertText: item.insertText,
                insertTextRules: item.isSnippet
                  ? monaco.languages.CompletionItemInsertTextRule
                      .InsertAsSnippet
                  : undefined,
                sortText: item.sortText,
                filterText: item.filterText,
                preselect: item.preselect,
                commitCharacters: item.commitCharacters,
                tags: item.tags as
                  | Monaco.languages.CompletionItemTag[]
                  | undefined,
                range: toMonacoCompletionRange(item.range, fallbackRange),
              }));

            finish({ suggestions, incomplete: msg.isIncomplete === true });
          }
        });

        postToExtension({
          type: "requestCompletion",
          requestId,
          fileUri,
          line: position.lineNumber - 1,
          character: position.column - 1,
          triggerCharacter: completionTriggerCharacter(monaco, context),
        });
      });
    },
  });

  monaco.languages.registerHoverProvider(monacoLanguageId, {
    provideHover(model, position) {
      const fileUri = model.uri.toString();
      const requestId = newRequestId();
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          unsub();
          useIntelligenceStore.getState().reportTimeout("hover", fileUri);
          resolve(null);
        }, 5000);
        const unsub = onExtensionMessage((msg) => {
          if (msg.type === "hoverResult" && msg.requestId === requestId) {
            clearTimeout(timer);
            unsub();
            useIntelligenceStore.getState().reportSuccess("hover", fileUri);
            if (msg.contents.length === 0) {
              resolve(null);
              return;
            }
            resolve({
              contents: msg.contents.map((c) => ({
                value: c.value,
              })),
            });
          }
        });
        postToExtension({
          type: "requestHover",
          requestId,
          fileUri,
          line: position.lineNumber - 1,
          character: position.column - 1,
        });
      });
    },
  });

  // ─── Inline completions (ghost text / Copilot) ──────────────────────

  monaco.languages.registerInlineCompletionsProvider(monacoLanguageId, {
    provideInlineCompletions(model, position, _context, token) {
      const fileUri = model.uri.toString();
      const requestId = newRequestId();

      const textBeforeCursor = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });
      const lastLine = model.getLineCount();
      const textAfterCursor = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: lastLine,
        endColumn: model.getLineMaxColumn(lastLine),
      });

      return new Promise((resolve) => {
        if (token.isCancellationRequested) {
          resolve({ items: [] });
          return;
        }

        const timer = setTimeout(() => {
          unsub();
          postToExtension({ type: "cancelRequest", requestId });
          resolve({ items: [] });
        }, 10_000);

        const onCancel = token.onCancellationRequested(() => {
          clearTimeout(timer);
          unsub();
          postToExtension({ type: "cancelRequest", requestId });
          resolve({ items: [] });
        });

        const unsub = onExtensionMessage((msg) => {
          if (
            msg.type === "inlineCompletionResult" &&
            msg.requestId === requestId
          ) {
            clearTimeout(timer);
            onCancel.dispose();
            unsub();
            const items: Monaco.languages.InlineCompletion[] = msg.items.map(
              (item) => ({
                insertText: item.insertText,
                range: {
                  startLineNumber: position.lineNumber,
                  startColumn: position.column,
                  endLineNumber: position.lineNumber,
                  endColumn: position.column,
                },
              }),
            );
            resolve({ items });
          }
        });

        postToExtension({
          type: "requestInlineCompletion",
          requestId,
          fileUri,
          line: position.lineNumber - 1,
          character: position.column - 1,
          textBeforeCursor: textBeforeCursor.slice(-MAX_PREFIX_CHARS),
          textAfterCursor: textAfterCursor.slice(0, MAX_SUFFIX_CHARS),
          languageId: languageIdForInlineCompletion(model),
        });
      });
    },
    disposeInlineCompletions() {
      // Nothing to dispose.
    },
  });
}

function completionTriggerCharacter(
  monaco: typeof Monaco,
  context: Monaco.languages.CompletionContext,
): string | undefined {
  if (
    context.triggerKind !==
    monaco.languages.CompletionTriggerKind.TriggerCharacter
  ) {
    return undefined;
  }

  return context.triggerCharacter || undefined;
}

function toMonacoCompletionRange(
  range: CompletionRangeData | undefined,
  fallbackRange: Monaco.IRange,
): Monaco.IRange | { insert: Monaco.IRange; replace: Monaco.IRange } {
  if (!range) return fallbackRange;
  if ("insert" in range) {
    return {
      insert: toMonacoRange(range.insert),
      replace: toMonacoRange(range.replace),
    };
  }
  return toMonacoRange(range);
}

function toMonacoRange(range: RangeLike): Monaco.IRange {
  return {
    startLineNumber: range.startLine + 1,
    startColumn: range.startCharacter + 1,
    endLineNumber: range.endLine + 1,
    endColumn: range.endCharacter + 1,
  };
}

function languageIdForInlineCompletion(
  model: Monaco.editor.ITextModel,
): string {
  const path = model.uri.path.toLowerCase();
  if (path.endsWith(".tsx")) return "typescriptreact";
  if (path.endsWith(".jsx")) return "javascriptreact";
  return model.getLanguageId();
}

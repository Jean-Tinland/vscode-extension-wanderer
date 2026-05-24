/**
 * Converts the EditorSettings forwarded from the extension host into a
 * Monaco `IEditorOptions` object and pushes it through the centralized
 * config store. All registered editors pick up the new values automatically.
 */
import type * as Monaco from "monaco-editor";
import type { EditorSettings } from "@shared/protocol";
import { mergeAndPush } from "./configStore";

type EditorOptions = Monaco.editor.IEditorOptions &
  Monaco.editor.IGlobalEditorOptions;

export function pushEditorSettings(settings: EditorSettings): void {
  const options: EditorOptions = {
    fontSize: settings.fontSize,
    fontFamily: settings.fontFamily,
    fontLigatures: settings.fontLigatures,
    lineHeight: settings.lineHeight || undefined,
    tabSize: settings.tabSize,
    insertSpaces: settings.insertSpaces,
    wordWrap: settings.wordWrap,
    wordWrapColumn: settings.wordWrapColumn,
    minimap: { enabled: settings.minimap },
    renderWhitespace: settings.renderWhitespace,
    cursorStyle: cursorStyleFromName(settings.cursorStyle),
    cursorBlinking: settings.cursorBlinking as EditorOptions["cursorBlinking"],
    smoothScrolling: settings.smoothScrolling,
    renderLineHighlight: settings.renderLineHighlight,
    linkedEditing: settings.linkedEditing,
    formatOnPaste: settings.formatOnPaste,
    formatOnType: settings.formatOnType,
    stickyScroll: { enabled: settings.stickyScroll },
    bracketPairColorization: {
      enabled: settings.bracketPairColorization,
      independentColorPoolPerBracketType:
        settings.bracketPairColorizationIndependentColorPoolPerBracketType,
    },
    guides: {
      bracketPairs: settings.guides.bracketPairs,
      indentation: settings.guides.indentation,
      highlightActiveIndentation: settings.guides.highlightActiveIndentation,
    },
    quickSuggestions: true,
    suggestOnTriggerCharacters: true,
    acceptSuggestionOnEnter: "on",
    wordBasedSuggestions: "currentDocument",

    scrollBeyondLastLine: false,
    // The canvas viewport is transformed by React Flow; fixed-position widgets
    // drift under transformed ancestors, so keep Monaco widgets non-fixed.
    fixedOverflowWidgets: false,
    automaticLayout: true,
  } as EditorOptions;

  // Drop undefined values so updateOptions doesn't overwrite live state with
  // explicit undefined.
  const cleaned = Object.fromEntries(
    Object.entries(options).filter(([, v]) => v !== undefined),
  ) as EditorOptions;

  mergeAndPush(cleaned);
}

// Monaco's cursor-style API takes an enum-like string union mapping to
// `monaco.editor.TextEditorCursorStyle`. The forwarded value is a free-form
// string ("line", "block", …); we leave unknown values to Monaco defaults.
const CURSOR_STYLES = new Set([
  "line",
  "block",
  "underline",
  "line-thin",
  "block-outline",
  "underline-thin",
]);

function cursorStyleFromName(
  name: string,
): EditorOptions["cursorStyle"] | undefined {
  return CURSOR_STYLES.has(name)
    ? (name as EditorOptions["cursorStyle"])
    : undefined;
}

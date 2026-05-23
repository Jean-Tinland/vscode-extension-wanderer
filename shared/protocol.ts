/**
 * Message protocol shared between the extension host and the canvas webview.
 * Source-of-truth lives here so both sides import the same types.
 */

export interface RangeLike {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
}

export interface LocationLike {
  uri: string;
  range: RangeLike;
}

export interface CanvasNode {
  id: string;
  fileUri: string;
  x: number;
  y: number;
  width: number;
  height: number;
  revealRange?: RangeLike;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  type: "definition" | "reference" | "manual";
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface EditorBufferSnapshot {
  content: string;
  languageId: string;
  isDirty: boolean;
}

export interface GraphSnapshot {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  camera: Camera;
  /** Optional persisted editor buffers keyed by file URI. */
  buffers?: Record<string, EditorBufferSnapshot>;
}

export const CANVAS_COMMANDS = [
  "zoomToFit",
  "requestSaveLayout",
  "openFile",
  "openManyFiles",
  "openNodeSwitcher",
  "focusNextNode",
  "focusPreviousNode",
  "openFocusedNodeInWorkbench",
  "closeFocusedNode",
  "toggleFocusedNodeSize",
  "toggleSnapToGrid",
  "toggleReferenceClickMode",
  "toggleProblemsPanel",
  "toggleShortcutHelp",
] as const;

export type CanvasCommand = (typeof CANVAS_COMMANDS)[number];

/** Extension → Webview */
export type ExtensionMessage =
  | {
      type: "init";
      layout: GraphSnapshot | null;
      settings: CanvasSettings;
      theme: MonacoThemeData;
      editorSettings: EditorSettings;
    }
  | {
      type: "openFileResult";
      requestId: string;
      node: CanvasNode;
      content: string;
      languageId: string;
      isDirty: boolean;
    }
  | {
      type: "definitionResult";
      requestId: string;
      sourceNodeId: string;
      locations: LocationLike[];
    }
  | {
      type: "referencesResult";
      requestId: string;
      sourceNodeId: string;
      locations: LocationLike[];
    }
  | {
      type: "documentChanged";
      uri: string;
      content: string;
      version: number;
      isDirty: boolean;
    }
  | { type: "themeChanged"; theme: MonacoThemeData }
  | { type: "editorSettingsChanged"; editorSettings: EditorSettings }
  | { type: "command"; command: CanvasCommand }
  | { type: "error"; message: string; requestId?: string }
  | {
      type: "hoverResult";
      requestId: string;
      contents: MarkdownString[];
    }
  | {
      type: "completionResult";
      requestId: string;
      items: CompletionItemData[];
      isIncomplete?: boolean;
    }
  | {
      type: "formatResult";
      requestId: string;
      edits: FormatEdit[];
    }
  | {
      type: "diagnostics";
      uri: string;
      markers: DiagnosticData[];
    }
  | {
      type: "inlineCompletionResult";
      requestId: string;
      items: InlineCompletionData[];
    }
  | {
      type: "inlineChatChunk";
      requestId: string;
      text: string;
    }
  | {
      type: "inlineChatResult";
      requestId: string;
      text: string;
    }
  | {
      type: "inlineChatError";
      requestId: string;
      message: string;
    };

/** Webview → Extension */
export type WebviewMessage =
  | { type: "ready" }
  | {
      type: "openFile";
      requestId: string;
      fileUri: string;
      placement?: NodePlacement;
      revealRange?: RangeLike;
    }
  | {
      type: "requestDefinition";
      requestId: string;
      sourceNodeId: string;
      fileUri: string;
      line: number;
      character: number;
    }
  | {
      type: "requestReferences";
      requestId: string;
      sourceNodeId: string;
      fileUri: string;
      line: number;
      character: number;
    }
  | { type: "applyEdit"; uri: string; text: string; version: number }
  | {
      type: "applyDelta";
      uri: string;
      changes: EditDelta[];
      version: number;
    }
  | { type: "saveLayout"; snapshot: GraphSnapshot }
  | { type: "revealInWorkbench"; fileUri: string; range?: RangeLike }
  | { type: "log"; level: "info" | "warn" | "error"; message: string }
  | { type: "requestOpenDialog"; options?: OpenDialogOptions }
  | { type: "requestSaveNamedLayout" }
  | { type: "requestLoadNamedLayout" }
  | {
      type: "requestHover";
      requestId: string;
      fileUri: string;
      line: number;
      character: number;
    }
  | {
      type: "requestCompletion";
      requestId: string;
      fileUri: string;
      line: number;
      character: number;
      triggerCharacter?: string;
    }
  | {
      type: "requestFormat";
      requestId: string;
      fileUri: string;
    }
  | { type: "requestSaveDocument"; fileUri: string }
  | {
      type: "requestInlineCompletion";
      requestId: string;
      fileUri: string;
      line: number;
      character: number;
      textBeforeCursor: string;
      textAfterCursor: string;
      languageId: string;
    }
  | {
      type: "requestInlineChat";
      requestId: string;
      fileUri: string;
      prompt: string;
      selectedText: string;
      fullText: string;
      line: number;
      character: number;
      languageId: string;
    }
  | { type: "cancelRequest"; requestId: string };

export interface NodePlacement {
  /** If provided, place new node relative to this node. */
  sourceNodeId?: string;
  /** Vertical index when stacking multiple results. */
  stackIndex?: number;
}

export interface OpenDialogOptions {
  allowMultiSelect?: boolean;
  pathFirst?: boolean;
}

export interface CanvasSettings {
  horizontalGap: number;
  verticalStack: number;
  defaultWidth: number;
  defaultHeight: number;
}

/** Subset of VS Code editor settings forwarded to Monaco. */
export interface EditorSettings {
  fontSize: number;
  fontFamily: string;
  fontLigatures: boolean;
  lineHeight: number;
  tabSize: number;
  insertSpaces: boolean;
  wordWrap: "off" | "on" | "wordWrapColumn" | "bounded";
  wordWrapColumn: number;
  minimap: boolean;
  renderWhitespace: "none" | "boundary" | "selection" | "trailing" | "all";
  cursorStyle: string;
  cursorBlinking: string;
  smoothScrolling: boolean;
  bracketPairColorization: boolean;
  bracketPairColorizationIndependentColorPoolPerBracketType: boolean;
  guides: {
    bracketPairs: boolean | "active";
    indentation: boolean;
    highlightActiveIndentation: boolean | "always";
  };
  linkedEditing: boolean;
  formatOnPaste: boolean;
  formatOnType: boolean;
  stickyScroll: boolean;
  renderLineHighlight: "none" | "gutter" | "line" | "all";
}

// ---- Monaco theme forwarding ----

export interface MonacoTokenRule {
  token: string;
  foreground?: string;
  background?: string;
  fontStyle?: string;
}

export interface MonacoThemeData {
  base: "vs" | "vs-dark" | "hc-black" | "hc-light";
  inherit: boolean;
  rules: MonacoTokenRule[];
  colors: Record<string, string>;
  /** The VS Code workbench theme name, e.g. "Default Dark Modern". */
  name?: string;
}

// ---- Language service forwarding ----

export interface MarkdownString {
  value: string;
}

export type CompletionRangeData =
  | RangeLike
  | {
      insert: RangeLike;
      replace: RangeLike;
    };

export interface CompletionItemData {
  label: string;
  labelDetail?: string;
  labelDescription?: string;
  kind: number;
  detail?: string;
  documentation?: string;
  insertText: string;
  /** When true, `insertText` uses snippet syntax ($0, ${1:placeholder}, …). */
  isSnippet?: boolean;
  sortText?: string;
  filterText?: string;
  preselect?: boolean;
  commitCharacters?: string[];
  tags?: number[];
  range?: CompletionRangeData;
}

export interface DiagnosticData {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  message: string;
  severity: number; // 1=Error 2=Warning 4=Info 8=Hint
  source?: string;
  code?: string | number;
}

export interface EditDelta {
  rangeOffset: number;
  rangeLength: number;
  text: string;
}

export interface FormatEdit {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  text: string;
}

export interface InlineCompletionData {
  insertText: string;
}

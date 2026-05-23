import {
  CANVAS_COMMANDS,
  type ExtensionMessage,
  type GraphSnapshot,
  type RangeLike,
  type WebviewMessage,
} from "./protocol";

type UnknownRecord = Record<string, unknown>;
const CANVAS_COMMAND_SET = new Set<string>(CANVAS_COMMANDS);

function isObject(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return isArray(value) && value.every(isString);
}

function isNumberArray(value: unknown): value is number[] {
  return isArray(value) && value.every(isNumber);
}

function asObject(value: unknown): UnknownRecord | null {
  return isObject(value) ? value : null;
}

function isRangeLike(value: unknown): value is RangeLike {
  const obj = asObject(value);
  if (!obj) return false;
  return (
    isNumber(obj.startLine) &&
    isNumber(obj.startCharacter) &&
    isNumber(obj.endLine) &&
    isNumber(obj.endCharacter)
  );
}

function isCompletionRange(value: unknown): boolean {
  if (isRangeLike(value)) return true;
  const obj = asObject(value);
  if (!obj) return false;
  return isRangeLike(obj.insert) && isRangeLike(obj.replace);
}

function isCanvasNodeLike(value: unknown): boolean {
  const obj = asObject(value);
  if (!obj) return false;
  const revealRange = obj.revealRange;
  if (revealRange !== undefined && !isRangeLike(revealRange)) return false;
  return (
    isString(obj.id) &&
    isString(obj.fileUri) &&
    isNumber(obj.x) &&
    isNumber(obj.y) &&
    isNumber(obj.width) &&
    isNumber(obj.height)
  );
}

function isCanvasEdgeLike(value: unknown): boolean {
  const obj = asObject(value);
  if (!obj) return false;
  return (
    isString(obj.id) &&
    isString(obj.source) &&
    isString(obj.target) &&
    (obj.type === "definition" ||
      obj.type === "reference" ||
      obj.type === "manual")
  );
}

function isGraphSnapshot(value: unknown): value is GraphSnapshot {
  const obj = asObject(value);
  if (!obj) return false;
  const camera = asObject(obj.camera);
  if (!camera) return false;

  if (!isArray(obj.nodes) || !obj.nodes.every(isCanvasNodeLike)) return false;
  if (!isArray(obj.edges) || !obj.edges.every(isCanvasEdgeLike)) return false;
  if (!isNumber(camera.x) || !isNumber(camera.y) || !isNumber(camera.zoom)) {
    return false;
  }

  if (obj.buffers !== undefined) {
    const buffers = asObject(obj.buffers);
    if (!buffers) return false;
    for (const buffer of Object.values(buffers)) {
      const item = asObject(buffer);
      if (!item) return false;
      if (
        !isString(item.content) ||
        !isString(item.languageId) ||
        !isBoolean(item.isDirty)
      ) {
        return false;
      }
    }
  }

  return true;
}

function isEditDeltaArray(value: unknown): boolean {
  if (!isArray(value)) return false;
  return value.every((item) => {
    const obj = asObject(item);
    return (
      !!obj &&
      isNumber(obj.rangeOffset) &&
      isNumber(obj.rangeLength) &&
      isString(obj.text)
    );
  });
}

function isLocationLikeArray(value: unknown): boolean {
  if (!isArray(value)) return false;
  return value.every((item) => {
    const obj = asObject(item);
    return !!obj && isString(obj.uri) && isRangeLike(obj.range);
  });
}

function isDiagnosticArray(value: unknown): boolean {
  if (!isArray(value)) return false;
  return value.every((item) => {
    const obj = asObject(item);
    if (!obj) return false;
    if (
      !isNumber(obj.startLine) ||
      !isNumber(obj.startCharacter) ||
      !isNumber(obj.endLine) ||
      !isNumber(obj.endCharacter) ||
      !isString(obj.message) ||
      !isNumber(obj.severity)
    ) {
      return false;
    }
    if (obj.source !== undefined && !isString(obj.source)) return false;
    if (obj.code !== undefined && !(isString(obj.code) || isNumber(obj.code))) {
      return false;
    }
    return true;
  });
}

function isOpenDialogOptions(value: unknown): boolean {
  const obj = asObject(value);
  if (!obj) return false;
  if (obj.allowMultiSelect !== undefined && !isBoolean(obj.allowMultiSelect)) {
    return false;
  }
  if (obj.pathFirst !== undefined && !isBoolean(obj.pathFirst)) {
    return false;
  }
  return true;
}

function isNodePlacement(value: unknown): boolean {
  const obj = asObject(value);
  if (!obj) return false;
  if (obj.sourceNodeId !== undefined && !isString(obj.sourceNodeId)) {
    return false;
  }
  if (obj.stackIndex !== undefined && !isNumber(obj.stackIndex)) {
    return false;
  }
  return true;
}

function isSettings(value: unknown): boolean {
  const obj = asObject(value);
  if (!obj) return false;
  return (
    isNumber(obj.horizontalGap) &&
    isNumber(obj.verticalStack) &&
    isNumber(obj.defaultWidth) &&
    isNumber(obj.defaultHeight)
  );
}

function isTheme(value: unknown): boolean {
  const obj = asObject(value);
  if (!obj) return false;
  const colors = asObject(obj.colors);
  const rules = obj.rules;
  if (!colors || !isArray(rules) || !isBoolean(obj.inherit)) return false;
  for (const color of Object.values(colors)) {
    if (!isString(color)) return false;
  }
  return (
    (obj.base === "vs" ||
      obj.base === "vs-dark" ||
      obj.base === "hc-black" ||
      obj.base === "hc-light") &&
    rules.every((rule) => {
      const entry = asObject(rule);
      if (!entry || !isString(entry.token)) return false;
      if (entry.foreground !== undefined && !isString(entry.foreground)) {
        return false;
      }
      if (entry.background !== undefined && !isString(entry.background)) {
        return false;
      }
      if (entry.fontStyle !== undefined && !isString(entry.fontStyle)) {
        return false;
      }
      return true;
    })
  );
}

function isEditorSettings(value: unknown): boolean {
  const obj = asObject(value);
  if (!obj) return false;
  const guides = asObject(obj.guides);
  if (!guides) return false;
  return (
    isNumber(obj.fontSize) &&
    isString(obj.fontFamily) &&
    isBoolean(obj.fontLigatures) &&
    isNumber(obj.lineHeight) &&
    isNumber(obj.tabSize) &&
    isBoolean(obj.insertSpaces) &&
    (obj.wordWrap === "off" ||
      obj.wordWrap === "on" ||
      obj.wordWrap === "wordWrapColumn" ||
      obj.wordWrap === "bounded") &&
    isNumber(obj.wordWrapColumn) &&
    isBoolean(obj.minimap) &&
    isString(obj.renderWhitespace) &&
    isString(obj.cursorStyle) &&
    isString(obj.cursorBlinking) &&
    isBoolean(obj.smoothScrolling) &&
    isBoolean(obj.bracketPairColorization) &&
    isBoolean(obj.bracketPairColorizationIndependentColorPoolPerBracketType) &&
    (guides.bracketPairs === true ||
      guides.bracketPairs === false ||
      guides.bracketPairs === "active") &&
    isBoolean(guides.indentation) &&
    (guides.highlightActiveIndentation === true ||
      guides.highlightActiveIndentation === false ||
      guides.highlightActiveIndentation === "always") &&
    isBoolean(obj.linkedEditing) &&
    isBoolean(obj.formatOnPaste) &&
    isBoolean(obj.formatOnType) &&
    isBoolean(obj.stickyScroll) &&
    (obj.renderLineHighlight === "none" ||
      obj.renderLineHighlight === "gutter" ||
      obj.renderLineHighlight === "line" ||
      obj.renderLineHighlight === "all")
  );
}

function isFormatEditArray(value: unknown): boolean {
  if (!isArray(value)) return false;
  return value.every((item) => {
    const obj = asObject(item);
    return (
      !!obj &&
      isNumber(obj.startLine) &&
      isNumber(obj.startCharacter) &&
      isNumber(obj.endLine) &&
      isNumber(obj.endCharacter) &&
      isString(obj.text)
    );
  });
}

function isCompletionItems(value: unknown): boolean {
  if (!isArray(value)) return false;
  return value.every((item) => {
    const obj = asObject(item);
    if (!obj) return false;
    if (
      !isString(obj.label) ||
      !isNumber(obj.kind) ||
      !isString(obj.insertText)
    ) {
      return false;
    }
    if (obj.labelDetail !== undefined && !isString(obj.labelDetail)) {
      return false;
    }
    if (obj.labelDescription !== undefined && !isString(obj.labelDescription)) {
      return false;
    }
    if (obj.detail !== undefined && !isString(obj.detail)) return false;
    if (obj.documentation !== undefined && !isString(obj.documentation)) {
      return false;
    }
    if (obj.isSnippet !== undefined && !isBoolean(obj.isSnippet)) {
      return false;
    }
    if (obj.sortText !== undefined && !isString(obj.sortText)) {
      return false;
    }
    if (obj.filterText !== undefined && !isString(obj.filterText)) {
      return false;
    }
    if (obj.preselect !== undefined && !isBoolean(obj.preselect)) {
      return false;
    }
    if (
      obj.commitCharacters !== undefined &&
      !isStringArray(obj.commitCharacters)
    ) {
      return false;
    }
    if (obj.tags !== undefined && !isNumberArray(obj.tags)) {
      return false;
    }
    if (obj.range !== undefined && !isCompletionRange(obj.range)) {
      return false;
    }
    return true;
  });
}

function isMarkdownStrings(value: unknown): boolean {
  if (!isArray(value)) return false;
  return value.every((item) => {
    const obj = asObject(item);
    return !!obj && isString(obj.value);
  });
}

function isInlineCompletionItems(value: unknown): boolean {
  if (!isArray(value)) return false;
  return value.every((item) => {
    const obj = asObject(item);
    return !!obj && isString(obj.insertText);
  });
}

export function isWebviewMessage(value: unknown): value is WebviewMessage {
  const obj = asObject(value);
  if (!obj || !isString(obj.type)) return false;

  switch (obj.type) {
    case "ready":
    case "requestSaveNamedLayout":
    case "requestLoadNamedLayout":
      return true;

    case "openFile":
      if (!isString(obj.requestId) || !isString(obj.fileUri)) return false;
      if (obj.revealRange !== undefined && !isRangeLike(obj.revealRange)) {
        return false;
      }
      if (obj.placement !== undefined && !isNodePlacement(obj.placement)) {
        return false;
      }
      return true;

    case "requestDefinition":
    case "requestReferences":
      return (
        isString(obj.requestId) &&
        isString(obj.sourceNodeId) &&
        isString(obj.fileUri) &&
        isNumber(obj.line) &&
        isNumber(obj.character)
      );

    case "applyEdit":
      return isString(obj.uri) && isString(obj.text) && isNumber(obj.version);

    case "applyDelta":
      return (
        isString(obj.uri) &&
        isNumber(obj.version) &&
        isEditDeltaArray(obj.changes)
      );

    case "saveLayout":
      return isGraphSnapshot(obj.snapshot);

    case "revealInWorkbench":
      if (!isString(obj.fileUri)) return false;
      if (obj.range !== undefined && !isRangeLike(obj.range)) return false;
      return true;

    case "log":
      return (
        (obj.level === "info" ||
          obj.level === "warn" ||
          obj.level === "error") &&
        isString(obj.message)
      );

    case "requestOpenDialog":
      if (obj.options === undefined) return true;
      return isOpenDialogOptions(obj.options);

    case "requestHover":
      return (
        isString(obj.requestId) &&
        isString(obj.fileUri) &&
        isNumber(obj.line) &&
        isNumber(obj.character)
      );

    case "requestCompletion":
      if (
        !isString(obj.requestId) ||
        !isString(obj.fileUri) ||
        !isNumber(obj.line) ||
        !isNumber(obj.character)
      ) {
        return false;
      }
      if (
        obj.triggerCharacter !== undefined &&
        !isString(obj.triggerCharacter)
      ) {
        return false;
      }
      return true;

    case "requestFormat":
      return isString(obj.requestId) && isString(obj.fileUri);

    case "requestSaveDocument":
      return isString(obj.fileUri);

    case "requestInlineCompletion":
      return (
        isString(obj.requestId) &&
        isString(obj.fileUri) &&
        isNumber(obj.line) &&
        isNumber(obj.character) &&
        isString(obj.textBeforeCursor) &&
        isString(obj.textAfterCursor) &&
        isString(obj.languageId)
      );

    case "requestInlineChat":
      return (
        isString(obj.requestId) &&
        isString(obj.fileUri) &&
        isString(obj.prompt) &&
        isString(obj.selectedText) &&
        isString(obj.fullText) &&
        isNumber(obj.line) &&
        isNumber(obj.character) &&
        isString(obj.languageId)
      );

    case "cancelRequest":
      return isString(obj.requestId);

    default:
      return false;
  }
}

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  const obj = asObject(value);
  if (!obj || !isString(obj.type)) return false;

  switch (obj.type) {
    case "init":
      return (
        (obj.layout === null || isGraphSnapshot(obj.layout)) &&
        isSettings(obj.settings) &&
        isTheme(obj.theme) &&
        isEditorSettings(obj.editorSettings)
      );

    case "openFileResult":
      return (
        isString(obj.requestId) &&
        isCanvasNodeLike(obj.node) &&
        isString(obj.content) &&
        isString(obj.languageId) &&
        isBoolean(obj.isDirty)
      );

    case "definitionResult":
    case "referencesResult":
      return (
        isString(obj.requestId) &&
        isString(obj.sourceNodeId) &&
        isLocationLikeArray(obj.locations)
      );

    case "documentChanged":
      return (
        isString(obj.uri) &&
        isString(obj.content) &&
        isNumber(obj.version) &&
        isBoolean(obj.isDirty)
      );

    case "themeChanged":
      return isTheme(obj.theme);

    case "editorSettingsChanged":
      return isEditorSettings(obj.editorSettings);

    case "command":
      return isString(obj.command) && CANVAS_COMMAND_SET.has(obj.command);

    case "error":
      if (!isString(obj.message)) return false;
      if (obj.requestId !== undefined && !isString(obj.requestId)) return false;
      return true;

    case "hoverResult":
      return isString(obj.requestId) && isMarkdownStrings(obj.contents);

    case "completionResult":
      if (!isString(obj.requestId) || !isCompletionItems(obj.items)) {
        return false;
      }
      if (obj.isIncomplete !== undefined && !isBoolean(obj.isIncomplete)) {
        return false;
      }
      return true;

    case "formatResult":
      return isString(obj.requestId) && isFormatEditArray(obj.edits);

    case "diagnostics":
      return isString(obj.uri) && isDiagnosticArray(obj.markers);

    case "inlineCompletionResult":
      return isString(obj.requestId) && isInlineCompletionItems(obj.items);

    case "inlineChatChunk":
    case "inlineChatResult":
      return isString(obj.requestId) && isString(obj.text);

    case "inlineChatError":
      return isString(obj.requestId) && isString(obj.message);

    default:
      return false;
  }
}

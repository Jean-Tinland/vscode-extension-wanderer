import Editor, { type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useStore } from "reactflow";
import { Handle, Position, type NodeProps } from "reactflow";
import { isNodeExpandedSize, useGraphStore } from "../state/graphStore";
import { useInteractionStore } from "../state/interactionStore";
import {
  getOrCreateModel,
  updateModel,
  isHostUpdate,
  releaseModel,
  retainModel,
} from "../monaco/modelCache";
import {
  newRequestId,
  onExtensionMessage,
  postToExtension,
} from "../bridge/vscode";
import {
  findFirstAvailableVerticalSlot,
  placeAdjacent,
} from "../graph/placement";
import { ResizeEdges } from "./ResizeEdges";
import { InlineChat } from "./InlineChat";
import {
  trackWebviewOpenRequest,
  resolveWebviewOpenRequest,
} from "./openRequestTracker";
import { ensureLanguageProviders } from "../monaco/languageProviders";
import { getEditorOptions, registerEditor } from "../monaco/configStore";
import { emitFocusNode, zoomToFitNodes } from "../navigation/events";
import { WANDERER_THEME_ID } from "../monaco/themeManager";
import { ensureMonacoRuntime } from "../monaco/runtime";
import { toMonacoLanguageId } from "../monaco/languageId";
import { Icon } from "../components/Icon";
import type { LocationLike, RangeLike } from "@shared/protocol";
import { useDiagnosticsStore } from "../state/diagnosticsStore";
import { useIntelligenceStore } from "../state/intelligenceStore";
import { Tooltip } from "../components/Tooltip";
import {
  clearCachedFileNeedsHostSync,
  ensureFile,
  getCachedFile,
  type FileContent,
  setCachedFile,
  updateCachedFileFromHost,
  updateCachedFileFromModel,
} from "./editorBufferStore";

export interface EditorNodeData {
  nodeId: string;
  fileUri: string;
}

// Subscribe to document change broadcasts and update the cache + model.
onExtensionMessage((msg) => {
  if (msg.type === "documentChanged") {
    updateCachedFileFromHost(msg.uri, msg.content, msg.version, msg.isDirty);
    // Live model update is handled inside the EditorNode that owns the model.
    updateModel(msg.uri, msg.content);
  }
});

const EDITOR_ZOOM_THRESHOLD = 0.65;
const MAX_PROJECT_USAGE_FILES = 80;

export const EditorNode = memo(function EditorNode({
  data,
}: NodeProps<EditorNodeData>) {
  const { nodeId, fileUri } = data;
  const [file, setFile] = useState<FileContent | null>(
    () => getCachedFile(fileUri) ?? null,
  );
  const [isDirty, setIsDirty] = useState<boolean>(
    () => getCachedFile(fileUri)?.isDirty ?? false,
  );
  const [monacoReady, setMonacoReady] = useState(false);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const [showInlineChat, setShowInlineChat] = useState(false);
  const [inlineChatCursorTop, setInlineChatCursorTop] = useState<number | null>(
    null,
  );

  const removeNode = useGraphStore((s) => s.removeNode);
  const markFocused = useGraphStore((s) => s.focusNode);
  const toggleNodeExpandedSize = useGraphStore((s) => s.toggleNodeExpandedSize);
  const isFocusedNode = useGraphStore((s) => s.focusedNodeId === nodeId);
  const isExpandedSize = useGraphStore((s) => {
    const node = s.nodes.find((entry) => entry.id === nodeId);
    if (!node) return false;
    return isNodeExpandedSize(node, s.settings);
  });
  const diagnostics = useDiagnosticsStore((s) => s.byUri[fileUri]);

  const focusThisNode = useCallback(
    (recordHistory = false) => {
      markFocused(nodeId, { recordHistory });
    },
    [markFocused, nodeId],
  );

  const onNodeMouseDownCapture = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      focusThisNode(false);

      if (isFocusedNode) return;
      if (!(event.target instanceof Element)) return;
      if (!event.target.closest(".cw-node__interaction-guard")) return;

      emitFocusNode({ nodeId, recordHistory: false, preserveZoom: true });
    },
    [focusThisNode, isFocusedNode, nodeId],
  );

  const openInWorkbench = useCallback(() => {
    const pos = editorRef.current?.getPosition();
    const range = pos
      ? {
          startLine: pos.lineNumber - 1,
          startCharacter: pos.column - 1,
          endLine: pos.lineNumber - 1,
          endCharacter: pos.column - 1,
        }
      : undefined;
    postToExtension({
      type: "revealInWorkbench",
      fileUri,
      range,
    });
  }, [fileUri]);

  const closeThisNode = useCallback(() => {
    removeNode(nodeId);
  }, [nodeId, removeNode]);

  const toggleSize = useCallback(() => {
    toggleNodeExpandedSize(nodeId);
    emitFocusNode({ nodeId, recordHistory: false, preserveZoom: true });
  }, [nodeId, toggleNodeExpandedSize]);

  const preventHeaderActionDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
    },
    [],
  );

  // Track zoom level to strip syntax coloring when far away.
  const zoom = useStore((s) => s.transform[2]);
  const normalizedZoom = zoom > 0 ? zoom : 1;
  const decolorize = normalizedZoom < EDITOR_ZOOM_THRESHOLD;
  const zoomPathLabel = compactNodePath(fileUri);
  const zoomPathLabelFontSize = Math.max(
    26,
    Math.min(180, 18 / normalizedZoom),
  );

  useEffect(() => {
    let cancelled = false;
    void ensureMonacoRuntime()
      .then(() => {
        if (!cancelled) {
          setMonacoReady(true);
        }
      })
      .catch((error: unknown) => {
        console.warn("[wanderer] Failed to initialize Monaco runtime", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (file) return;
    let cancelled = false;
    ensureFile(fileUri)
      .then((fc) => {
        if (!cancelled) {
          setFile(fc);
          setIsDirty(fc.isDirty);
        }
      })
      .catch((err) =>
        console.warn("Wanderer: failed to load file", fileUri, err),
      );
    return () => {
      cancelled = true;
    };
  }, [fileUri, file]);

  useEffect(() => {
    return onExtensionMessage((msg) => {
      if (msg.type !== "documentChanged" || msg.uri !== fileUri) return;
      setIsDirty(msg.isDirty);
    });
  }, [fileUri]);

  const openInlineChat = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      setInlineChatCursorTop(null);
      setShowInlineChat(true);
      return;
    }

    const pos = editor.getPosition();
    const visible = pos ? editor.getScrolledVisiblePosition(pos) : null;
    const cursorTop = visible
      ? Math.max(8, visible.top + visible.height + 8)
      : null;
    setInlineChatCursorTop(cursorTop);
    setShowInlineChat(true);
  }, []);

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      const unregister = registerEditor(editor);
      editor.onDidDispose(unregister);

      const unregisterIntelligenceActions = useIntelligenceStore
        .getState()
        .registerEditorActions(fileUri, {
          retryHover: () => {
            editor.focus();
            void editor.getAction("editor.action.showHover")?.run();
          },
          retryCompletion: () => {
            editor.focus();
            editor.trigger(
              "wanderer.retry",
              "editor.action.triggerSuggest",
              {},
            );
          },
        });
      editor.onDidDispose(unregisterIntelligenceActions);

      const requestDocumentSave = () => {
        postToExtension({ type: "requestSaveDocument", fileUri });
      };

      if (!file) return;
      const model = getOrCreateModel(fileUri, file.text, file.languageId);
      retainModel(fileUri);
      editor.onDidDispose(() => {
        releaseModel(fileUri);
      });
      editor.setModel(model);

      if (file.needsHostSync) {
        postToExtension({
          type: "applyEdit",
          uri: fileUri,
          text: model.getValue(),
          version: model.getVersionId(),
        });
        clearCachedFileNeedsHostSync(fileUri);
      }

      // Register language providers (hover, completion) once per language.
      ensureLanguageProviders(monaco, file.languageId);

      // Ensure the first paint happens immediately, including token colors.
      requestAnimationFrame(() => {
        editor.layout();
        editor.render(true);
      });

      const node = useGraphStore.getState().findById(nodeId);
      if (node?.revealRange) {
        const r = new monaco.Range(
          node.revealRange.startLine + 1,
          node.revealRange.startCharacter + 1,
          node.revealRange.endLine + 1,
          node.revealRange.endCharacter + 1,
        );
        editor.revealRangeInCenter(r);
        editor.setSelection(r);
      }

      let cmdHoverDecorationIds: string[] = [];
      let isModifierPressed = false;
      let isPointerOverText = false;
      let hoverPosition: Monaco.IPosition | null = null;
      let cmdHoverRangeKey: string | null = null;

      const revealRangeInCurrentEditor = (range: RangeLike) => {
        const target = new monaco.Range(
          range.startLine + 1,
          range.startCharacter + 1,
          range.endLine + 1,
          range.endCharacter + 1,
        );
        editor.revealRangeInCenter(target);
        editor.setSelection(target);
        editor.focus();
      };

      const clearCmdHoverDecoration = () => {
        if (cmdHoverDecorationIds.length === 0 && cmdHoverRangeKey === null) {
          return;
        }
        cmdHoverDecorationIds = editor.deltaDecorations(
          cmdHoverDecorationIds,
          [],
        );
        cmdHoverRangeKey = null;
      };

      const updateCmdHoverDecoration = () => {
        if (!isModifierPressed || !isPointerOverText || !hoverPosition) {
          clearCmdHoverDecoration();
          return;
        }
        const model = editor.getModel();
        if (!model) {
          clearCmdHoverDecoration();
          return;
        }
        const word = model.getWordAtPosition(hoverPosition);
        if (!word) {
          clearCmdHoverDecoration();
          return;
        }

        const range = new monaco.Range(
          hoverPosition.lineNumber,
          word.startColumn,
          hoverPosition.lineNumber,
          word.endColumn,
        );
        const key = `${range.startLineNumber}:${range.startColumn}:${range.endLineNumber}:${range.endColumn}`;
        if (key === cmdHoverRangeKey) return;

        cmdHoverDecorationIds = editor.deltaDecorations(cmdHoverDecorationIds, [
          {
            range,
            options: {
              inlineClassName: "cw-editor__modifier-link",
            },
          },
        ]);
        cmdHoverRangeKey = key;
      };

      editor.onMouseMove((e) => {
        isModifierPressed = e.event.metaKey || e.event.ctrlKey;
        isPointerOverText =
          e.target.type === monaco.editor.MouseTargetType.CONTENT_TEXT;
        hoverPosition = isPointerOverText ? e.target.position : null;
        updateCmdHoverDecoration();
      });

      editor.onMouseLeave(() => {
        isPointerOverText = false;
        hoverPosition = null;
        clearCmdHoverDecoration();
      });

      editor.onDidChangeModelContent((e) => {
        // Skip changes that originate from the extension host (documentChanged
        // → updateModel) to prevent an echo loop that corrupts the document.
        if (isHostUpdate(fileUri)) return;

        // Send incremental deltas for each content change.
        const changes = e.changes.map((c) => ({
          rangeOffset: c.rangeOffset,
          rangeLength: c.rangeLength,
          text: c.text,
        }));
        updateCachedFileFromModel(
          fileUri,
          model.getValue(),
          model.getVersionId(),
        );
        setIsDirty(true);

        postToExtension({
          type: "applyDelta",
          uri: fileUri,
          changes,
          version: model.getVersionId(),
        });
      });

      // CMD/Ctrl-click → follow definition or open project usages,
      // depending on the active toolbar mode.
      editor.onMouseDown((e) => {
        if (!(e.event.metaKey || e.event.ctrlKey)) return;
        const pos = e.target.position;
        if (!pos) return;
        const referenceClickMode =
          useInteractionStore.getState().referenceClickMode;
        if (referenceClickMode === "projectUsages") {
          requestProjectUsagesAt(
            nodeId,
            fileUri,
            pos.lineNumber - 1,
            pos.column - 1,
            revealRangeInCurrentEditor,
          );
          return;
        }
        requestDefinitionAt(
          nodeId,
          fileUri,
          pos.lineNumber - 1,
          pos.column - 1,
          revealRangeInCurrentEditor,
        );
      });

      // Capture CMD/Ctrl+S at window level so VS Code's global save command
      // cannot steal the shortcut before Monaco dispatches it.
      const onWindowKeyDown = (event: KeyboardEvent) => {
        isModifierPressed = event.metaKey || event.ctrlKey;
        updateCmdHoverDecoration();

        if (!editor.hasTextFocus()) return;
        if (!(event.metaKey || event.ctrlKey)) return;
        if (event.key.toLowerCase() !== "s") return;
        event.preventDefault();
        event.stopPropagation();
        requestDocumentSave();
      };

      const onWindowKeyUp = (event: KeyboardEvent) => {
        if (event.key !== "Meta" && event.key !== "Control") return;
        isModifierPressed = event.metaKey || event.ctrlKey;
        if (!isModifierPressed) {
          clearCmdHoverDecoration();
          return;
        }
        updateCmdHoverDecoration();
      };

      const onWindowBlur = () => {
        isModifierPressed = false;
        clearCmdHoverDecoration();
      };

      window.addEventListener("keydown", onWindowKeyDown, true);
      window.addEventListener("keyup", onWindowKeyUp, true);
      window.addEventListener("blur", onWindowBlur);
      editor.onDidDispose(() => {
        window.removeEventListener("keydown", onWindowKeyDown, true);
        window.removeEventListener("keyup", onWindowKeyUp, true);
        window.removeEventListener("blur", onWindowBlur);
        clearCmdHoverDecoration();
      });

      // Keep Monaco-native keybinding as a fallback in environments where
      // global keydown capture is restricted.
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        requestDocumentSave();
      });

      // CMD/Ctrl+I → open inline chat
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, () => {
        openInlineChat();
      });
    },
    [file, fileUri, nodeId, openInlineChat],
  );

  return (
    <>
      <ResizeEdges nodeId={nodeId} />
      <div
        className={`cw-node${isFocusedNode ? " cw-node--focused" : ""}`}
        onMouseDownCapture={onNodeMouseDownCapture}
      >
        <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
        <header className="cw-node__header">
          <span className="cw-node__title" title={fileUri}>
            <span className="cw-node__title-text">{shortName(fileUri)}</span>
            {isDirty ? (
              <span
                className="cw-node__dirty"
                title="Unsaved changes"
                aria-label="Unsaved changes"
              >
                *
              </span>
            ) : null}
            {diagnostics && diagnostics.counts.total > 0 ? (
              <span
                className="cw-node__diagnostics"
                title={`${diagnostics.counts.errors} errors, ${diagnostics.counts.warnings} warnings, ${diagnostics.counts.infos} info, ${diagnostics.counts.hints} hints`}
              >
                {diagnostics.counts.errors > 0 ? (
                  <span className="cw-node__diag-badge cw-node__diag-badge--error">
                    E {diagnostics.counts.errors}
                  </span>
                ) : null}
                {diagnostics.counts.warnings > 0 ? (
                  <span className="cw-node__diag-badge cw-node__diag-badge--warning">
                    W {diagnostics.counts.warnings}
                  </span>
                ) : null}
                {diagnostics.counts.errors === 0 &&
                diagnostics.counts.warnings === 0 ? (
                  <span className="cw-node__diag-badge cw-node__diag-badge--info">
                    I {diagnostics.counts.infos + diagnostics.counts.hints}
                  </span>
                ) : null}
              </span>
            ) : null}
          </span>
          <div
            className="cw-node__actions nodrag nopan"
            role="group"
            aria-label="Node actions"
          >
            <Tooltip
              label={
                isExpandedSize
                  ? "Restore default node size"
                  : "Expand this node"
              }
            >
              <button
                type="button"
                className="cw-node__icon-button nodrag nopan"
                onPointerDown={preventHeaderActionDrag}
                onClick={toggleSize}
                title={isExpandedSize ? "Restore size" : "Expand size"}
                aria-label={
                  isExpandedSize
                    ? "Restore default node size"
                    : "Expand this node"
                }
              >
                <Icon
                  code={isExpandedSize ? "restore-node" : "expand-node"}
                  width={14}
                  height={14}
                  aria-hidden="true"
                />
              </button>
            </Tooltip>
            <Tooltip label="Open on the side in a native editor">
              <button
                type="button"
                className="cw-node__icon-button nodrag nopan"
                onPointerDown={preventHeaderActionDrag}
                onClick={openInWorkbench}
                aria-label="Open this file in a native editor"
              >
                <Icon
                  code="external-link"
                  width={14}
                  height={14}
                  aria-hidden="true"
                />
              </button>
            </Tooltip>
            <Tooltip label="Close this node">
              <button
                type="button"
                className="cw-node__icon-button nodrag nopan"
                onPointerDown={preventHeaderActionDrag}
                onClick={closeThisNode}
                title="Close"
                aria-label="Close this node"
              >
                <Icon code="close" width={14} height={14} aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
        </header>
        <div className="cw-node__body">
          <div className="cw-node__interaction-guard nowheel nokey">
            {file && monacoReady ? (
              <div
                className={`cw-node__editor-wrap${decolorize ? " cw-node__editor-wrap--plain" : ""}`}
              >
                <Editor
                  defaultLanguage={toMonacoLanguageId(file.languageId)}
                  defaultValue={file.text}
                  keepCurrentModel
                  theme={WANDERER_THEME_ID}
                  onMount={handleMount}
                  options={{
                    ...getEditorOptions(),
                    automaticLayout: true,
                    scrollBeyondLastLine: false,
                    fixedOverflowWidgets: false,
                    inlineSuggest: { enabled: true },
                  }}
                />
                {decolorize ? (
                  <div
                    className="cw-node__zoom-path"
                    style={{ fontSize: `${zoomPathLabelFontSize}px` }}
                    title={fileUri}
                    aria-hidden="true"
                  >
                    {zoomPathLabel}
                  </div>
                ) : null}
                {showInlineChat && file && (
                  <InlineChat
                    fileUri={fileUri}
                    languageId={file.languageId}
                    cursorTop={inlineChatCursorTop}
                    getSelectedText={() => {
                      const editor = editorRef.current;
                      if (!editor) return "";
                      const sel = editor.getSelection();
                      if (!sel || sel.isEmpty()) return "";
                      return editor.getModel()?.getValueInRange(sel) ?? "";
                    }}
                    getFullText={() =>
                      editorRef.current?.getModel()?.getValue() ?? ""
                    }
                    getCursorPosition={() => {
                      const pos = editorRef.current?.getPosition();
                      return {
                        line: (pos?.lineNumber ?? 1) - 1,
                        character: (pos?.column ?? 1) - 1,
                      };
                    }}
                    applyText={(text, hasSelection) => {
                      const editor = editorRef.current;
                      const model = editor?.getModel();
                      if (!editor || !model) return;
                      const sel = editor.getSelection();
                      if (hasSelection && sel && !sel.isEmpty()) {
                        editor.executeEdits("inline-chat", [
                          { range: sel, text },
                        ]);
                      } else {
                        const pos = editor.getPosition();
                        if (!pos) return;
                        const range = {
                          startLineNumber: pos.lineNumber,
                          startColumn: pos.column,
                          endLineNumber: pos.lineNumber,
                          endColumn: pos.column,
                        };
                        editor.executeEdits("inline-chat", [{ range, text }]);
                      }
                      editor.focus();
                    }}
                    onClose={() => {
                      setInlineChatCursorTop(null);
                      setShowInlineChat(false);
                      editorRef.current?.focus();
                    }}
                  />
                )}
              </div>
            ) : (
              <pre className="cw-preview">Loading…</pre>
            )}
          </div>
        </div>
        <Handle
          type="source"
          position={Position.Right}
          style={{ opacity: 0 }}
        />
      </div>
    </>
  );
});

function shortName(uri: string): string {
  try {
    const decoded = decodeURIComponent(uri);
    const parts = decoded
      .replace(/.*\/\//, "")
      .split("/")
      .filter(Boolean);
    return parts.slice(-2).join("/") || decoded;
  } catch {
    return uri;
  }
}

function compactNodePath(uri: string): string {
  try {
    const decoded = decodeURIComponent(uri);
    const withoutScheme = decoded.replace(/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//, "");
    const parts = withoutScheme.split("/").filter(Boolean);
    if (parts.length <= 2) return parts.join("/") || withoutScheme;
    return parts.slice(-2).join("/");
  } catch {
    return uri;
  }
}

interface OpenTargetOptions {
  focusMode?: "canvas" | "graph" | "none";
  recordHistory?: boolean;
}

interface OpenTargetResult {
  nodeId: string;
  openedNew: boolean;
}

function requestDefinitionAt(
  sourceNodeId: string,
  fileUri: string,
  line: number,
  character: number,
  revealInCurrentEditor?: (range: RangeLike) => void,
): void {
  const requestId = newRequestId();
  const unsubscribe = onExtensionMessage((msg) => {
    if (msg.type !== "definitionResult" || msg.requestId !== requestId) return;
    unsubscribe();

    const sameFileLocation = pickSameFileTargetLocation(
      msg.locations,
      fileUri,
      line,
      character,
    );
    if (sameFileLocation) {
      revealInCurrentEditor?.(sameFileLocation.range);
    }

    const locationsToOpen = msg.locations.filter((loc) => loc.uri !== fileUri);
    if (locationsToOpen.length === 0) return;

    const store = useGraphStore.getState();
    const settings = store.settings;
    const source = store.findById(sourceNodeId);
    const occupied = store.nodes.map((n) => ({
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
    }));

    const pendingOpens: Array<Promise<OpenTargetResult | null>> = [];

    locationsToOpen.forEach(
      (loc: import("@shared/protocol").LocationLike, idx: number) => {
        const preferred = placeAdjacent(source, settings, idx);
        const pos = findFirstAvailableVerticalSlot(
          preferred,
          occupied,
          settings,
        );
        occupied.push({
          x: pos.x,
          y: pos.y,
          width: settings.defaultWidth,
          height: settings.defaultHeight,
        });

        pendingOpens.push(
          openTargetAt(
            loc.uri,
            pos.x,
            pos.y,
            sourceNodeId,
            "definition",
            loc.range,
            { focusMode: "none", recordHistory: false },
          ),
        );
      },
    );

    void Promise.all(pendingOpens).then((results) => {
      applyOpenedTargetsNavigation(results);
    });
  });
  postToExtension({
    type: "requestDefinition",
    requestId,
    sourceNodeId,
    fileUri,
    line,
    character,
  });
}

function requestProjectUsagesAt(
  sourceNodeId: string,
  fileUri: string,
  line: number,
  character: number,
  revealInCurrentEditor?: (range: RangeLike) => void,
): void {
  const requestId = newRequestId();
  const unsubscribe = onExtensionMessage((msg) => {
    if (msg.type !== "referencesResult" || msg.requestId !== requestId) return;
    unsubscribe();

    const sameFileLocation = pickSameFileTargetLocation(
      msg.locations,
      fileUri,
      line,
      character,
    );
    if (sameFileLocation) {
      revealInCurrentEditor?.(sameFileLocation.range);
    }

    const uniqueByFile = firstLocationPerUri(msg.locations).slice(
      0,
      MAX_PROJECT_USAGE_FILES,
    );

    const locationsToOpen = uniqueByFile.filter((loc) => loc.uri !== fileUri);
    if (locationsToOpen.length === 0) return;

    const store = useGraphStore.getState();
    const settings = store.settings;
    const source = store.findById(sourceNodeId);
    const occupied = store.nodes.map((n) => ({
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
    }));

    const pendingOpens: Array<Promise<OpenTargetResult | null>> = [];

    locationsToOpen.forEach((loc, idx) => {
      const preferred = placeAdjacent(source, settings, idx);
      const pos = findFirstAvailableVerticalSlot(preferred, occupied, settings);
      occupied.push({
        x: pos.x,
        y: pos.y,
        width: settings.defaultWidth,
        height: settings.defaultHeight,
      });

      pendingOpens.push(
        openTargetAt(
          loc.uri,
          pos.x,
          pos.y,
          sourceNodeId,
          "reference",
          loc.range,
          { focusMode: "none", recordHistory: false },
        ),
      );
    });

    void Promise.all(pendingOpens).then((results) => {
      applyOpenedTargetsNavigation(results);
    });
  });
  postToExtension({
    type: "requestReferences",
    requestId,
    sourceNodeId,
    fileUri,
    line,
    character,
  });
}

function applyOpenedTargetsNavigation(
  results: Array<OpenTargetResult | null>,
): void {
  const opened = results.filter(
    (result): result is OpenTargetResult => result !== null,
  );
  if (opened.length === 0) return;

  const openedNodeIds = Array.from(
    new Set(opened.map((result) => result.nodeId)),
  );

  if (openedNodeIds.length === 1) {
    focusGraphNode(openedNodeIds[0]);
    return;
  }

  useGraphStore.getState().clearFocus();

  const newOpenedNodeIds = Array.from(
    new Set(
      opened
        .filter((result) => result.openedNew)
        .map((result) => result.nodeId),
    ),
  );
  if (newOpenedNodeIds.length === 0) return;

  zoomToFitNodes(newOpenedNodeIds, { padding: 0.3, duration: 320 });
}

function firstLocationPerUri(locations: LocationLike[]): LocationLike[] {
  const byUri = new Map<string, LocationLike>();
  for (const location of locations) {
    if (byUri.has(location.uri)) continue;
    byUri.set(location.uri, location);
  }
  return [...byUri.values()];
}

function pickSameFileTargetLocation(
  locations: LocationLike[],
  fileUri: string,
  line: number,
  character: number,
): LocationLike | undefined {
  const inSameFile = locations.filter((loc) => loc.uri === fileUri);
  if (inSameFile.length === 0) return undefined;

  return (
    inSameFile.find(
      (loc) => !rangeContainsPosition(loc.range, line, character),
    ) ?? inSameFile[0]
  );
}

function rangeContainsPosition(
  range: RangeLike,
  line: number,
  character: number,
): boolean {
  if (line < range.startLine || line > range.endLine) return false;
  if (line === range.startLine && character < range.startCharacter) {
    return false;
  }
  if (line === range.endLine && character > range.endCharacter) {
    return false;
  }
  return true;
}

/**
 * If a node for fileUri already exists, focus it (and optionally add an edge).
 * Otherwise open a new node at the given position.
 */
function openTargetAt(
  fileUri: string,
  x: number,
  y: number,
  sourceNodeId: string | undefined,
  edgeType: "definition" | "reference" | "manual",
  revealRange?: import("@shared/protocol").RangeLike,
  options?: OpenTargetOptions,
): Promise<OpenTargetResult | null> {
  const focusMode = options?.focusMode ?? "canvas";
  const recordHistory = options?.recordHistory ?? true;
  const store = useGraphStore.getState();

  // Deduplicate: if the file is already on the canvas, just focus it.
  const existing = store.nodes.find((n) => n.fileUri === fileUri);
  if (existing) {
    if (sourceNodeId && sourceNodeId !== existing.id) {
      store.addEdge({
        id: `${sourceNodeId}->${existing.id}`,
        source: sourceNodeId,
        target: existing.id,
        type: edgeType,
      });
    }
    applyTargetFocus(existing.id, focusMode, recordHistory);
    return Promise.resolve({ nodeId: existing.id, openedNew: false });
  }

  const requestId = newRequestId();

  return new Promise((resolve) => {
    const unsubscribe = onExtensionMessage((msg) => {
      if (msg.type === "openFileResult" && msg.requestId === requestId) {
        resolveWebviewOpenRequest(requestId);
        unsubscribe();
        const node = { ...msg.node, x, y, revealRange };
        store.upsertNode(node);
        applyTargetFocus(node.id, focusMode, recordHistory);
        setCachedFile(fileUri, {
          text: msg.content,
          languageId: msg.languageId,
          version: 0,
          isDirty: msg.isDirty,
          needsHostSync: false,
        });
        if (sourceNodeId) {
          store.addEdge({
            id: `${sourceNodeId}->${node.id}`,
            source: sourceNodeId,
            target: node.id,
            type: edgeType,
          });
        }
        resolve({ nodeId: node.id, openedNew: true });
      } else if (msg.type === "error" && msg.requestId === requestId) {
        resolveWebviewOpenRequest(requestId);
        unsubscribe();
        resolve(null);
      }
    });

    trackWebviewOpenRequest(requestId);
    postToExtension({
      type: "openFile",
      requestId,
      fileUri,
      revealRange,
      placement: sourceNodeId ? { sourceNodeId } : undefined,
    });
  });
}

function applyTargetFocus(
  nodeId: string,
  focusMode: "canvas" | "graph" | "none",
  recordHistory: boolean,
): void {
  if (focusMode === "none") return;
  if (focusMode === "graph") {
    focusGraphNode(nodeId, recordHistory);
    return;
  }
  focusCanvasNode(nodeId, recordHistory);
}

function focusGraphNode(nodeId: string, recordHistory = true): void {
  useGraphStore.getState().focusNode(nodeId, { recordHistory });
}

/** Emit a React Flow fitView centered on a specific node. */
function focusCanvasNode(nodeId: string, recordHistory = true): void {
  focusGraphNode(nodeId, recordHistory);
  emitFocusNode({ nodeId, recordHistory: false });
}

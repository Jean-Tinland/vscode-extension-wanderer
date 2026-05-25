import { useEffect } from "react";
import type {
  CanvasCommand,
  CanvasNode,
  CanvasSettings,
  EditorSettings,
  GraphSnapshot,
  ReferenceClickMode,
  SavedLayoutSummary,
} from "@shared/protocol";
import { onExtensionMessage, postToExtension } from "../bridge/vscode";
import { findFirstAvailableVerticalSlot } from "../graph/placement";
import { pushEditorSettings } from "../monaco/editorConfig";
import { queueMonacoTheme } from "../monaco/runtime";
import { rememberLayoutBuffers } from "../nodes/editorBufferStore";
import { isPendingWebviewOpenRequest } from "../nodes/openRequestTracker";
import { useDiagnosticsStore } from "../state/diagnosticsStore";
import { useGraphStore } from "../state/graphStore";
import { useViewportStore } from "../state/viewportStore";

interface UseExtensionMessagesOptions {
  handleCanvasCommand: (command: CanvasCommand) => void;
  hydrate: (snapshot: GraphSnapshot | null) => void;
  setSavedLayouts: (layouts: SavedLayoutSummary[]) => void;
  setSettings: (settings: CanvasSettings) => void;
  upsertNode: (node: CanvasNode) => void;
  setEditorSettings: (settings: EditorSettings) => void;
  setReferenceClickMode: (mode: ReferenceClickMode) => void;
  queueCommandOpenViewportUpdate: (nodeId: string) => void;
}

export function useExtensionMessages({
  handleCanvasCommand,
  hydrate,
  setSavedLayouts,
  setSettings,
  upsertNode,
  setEditorSettings,
  setReferenceClickMode,
  queueCommandOpenViewportUpdate,
}: UseExtensionMessagesOptions): void {
  useEffect(() => {
    const unsubscribe = onExtensionMessage((msg) => {
      if (msg.type === "init") {
        if (msg.theme) queueMonacoTheme(msg.theme);
        if (msg.editorSettings) {
          setEditorSettings(msg.editorSettings);
          pushEditorSettings(msg.editorSettings);
        }
        setSavedLayouts(msg.savedLayouts);
        setReferenceClickMode(msg.referenceClickMode);
        if (msg.settings) setSettings(msg.settings);
        if (msg.layout) {
          rememberLayoutBuffers(msg.layout.buffers);
          hydrate(msg.layout);
        }
        return;
      }

      if (msg.type === "themeChanged") {
        queueMonacoTheme(msg.theme);
        return;
      }

      if (msg.type === "editorSettingsChanged") {
        setEditorSettings(msg.editorSettings);
        pushEditorSettings(msg.editorSettings);
        return;
      }

      if (msg.type === "savedLayoutsChanged") {
        setSavedLayouts(msg.layouts);
        return;
      }

      if (msg.type === "diagnostics") {
        useDiagnosticsStore.getState().setDiagnostics(msg.uri, msg.markers);
        return;
      }

      if (msg.type === "openFileResult") {
        if (isPendingWebviewOpenRequest(msg.requestId)) return;
        // Command-driven open (no in-flight request waited for this).
        const graph = useGraphStore.getState();
        const existing = graph.nodes.find(
          (n) => n.fileUri === msg.node.fileUri,
        );
        if (existing) {
          graph.focusNode(existing.id);
          queueCommandOpenViewportUpdate(existing.id);
          return;
        }

        const cam = useViewportStore.getState();
        const pos = findFirstAvailableVerticalSlot(
          {
            x: -cam.x / cam.zoom,
            y: -cam.y / cam.zoom,
          },
          graph.nodes.map((node) => ({
            x: node.x,
            y: node.y,
            width: node.width,
            height: node.height,
          })),
          graph.settings,
        );
        const node = {
          ...msg.node,
          x: pos.x,
          y: pos.y,
        };
        upsertNode(node);
        useGraphStore.getState().focusNode(node.id);
        queueCommandOpenViewportUpdate(node.id);
        return;
      }

      if (msg.type === "command") {
        handleCanvasCommand(msg.command);
      }
    });

    postToExtension({ type: "ready" });
    return unsubscribe;
  }, [
    handleCanvasCommand,
    hydrate,
    queueCommandOpenViewportUpdate,
    setEditorSettings,
    setReferenceClickMode,
    setSavedLayouts,
    setSettings,
    upsertNode,
  ]);
}

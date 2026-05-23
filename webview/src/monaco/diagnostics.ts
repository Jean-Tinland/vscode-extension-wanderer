/**
 * Listens for diagnostics messages from the extension host and
 * applies them as Monaco editor markers.
 */
import * as monaco from "monaco-editor";
import { onExtensionMessage } from "../bridge/vscode";
import { getModel } from "./modelCache";
import { useDiagnosticsStore } from "../state/diagnosticsStore";

export function initDiagnosticsListener(): void {
  onExtensionMessage((msg) => {
    if (msg.type !== "diagnostics") return;

    useDiagnosticsStore.getState().setDiagnostics(msg.uri, msg.markers);

    const model = getModel(msg.uri);
    if (!model) return;
    const markers: monaco.editor.IMarkerData[] = msg.markers.map((m) => ({
      startLineNumber: m.startLine + 1,
      startColumn: m.startCharacter + 1,
      endLineNumber: m.endLine + 1,
      endColumn: m.endCharacter + 1,
      message: m.message,
      severity: m.severity,
      source: m.source,
      code: m.code !== undefined ? String(m.code) : undefined,
    }));
    monaco.editor.setModelMarkers(model, "diagnostics", markers);
  });
}

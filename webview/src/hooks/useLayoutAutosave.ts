import { useEffect, useRef } from "react";
import { postToExtension } from "../bridge/vscode";
import { collectLayoutBuffers } from "../nodes/editorBufferStore";
import { useGraphStore } from "../state/graphStore";
import { useViewportStore } from "../state/viewportStore";
import {
  buildBufferSignature,
  buildCameraSignature,
  buildGraphSignature,
  type LayoutBuffers,
} from "../utils/layoutSignatures";

const DEFAULT_AUTOSAVE_FULL_DEBOUNCE_MS = 550;
const DEFAULT_AUTOSAVE_CAMERA_DEBOUNCE_MS = 240;
const DEFAULT_AUTOSAVE_STATS_LOG_INTERVAL = 25;

interface AutosaveState {
  lastGraphSignature: string;
  lastBufferSignature: string;
  lastPersistSignature: string;
  cachedBuffers: LayoutBuffers;
  fullWrites: number;
  cameraWrites: number;
  skippedWrites: number;
}

interface UseLayoutAutosaveOptions {
  fullDebounceMs?: number;
  cameraDebounceMs?: number;
  statsLogInterval?: number;
}

export function useLayoutAutosave(
  options: UseLayoutAutosaveOptions = {},
): void {
  const fullDebounceMs =
    options.fullDebounceMs ?? DEFAULT_AUTOSAVE_FULL_DEBOUNCE_MS;
  const cameraDebounceMs =
    options.cameraDebounceMs ?? DEFAULT_AUTOSAVE_CAMERA_DEBOUNCE_MS;
  const statsLogInterval =
    options.statsLogInterval ?? DEFAULT_AUTOSAVE_STATS_LOG_INTERVAL;

  const autosaveRef = useRef<AutosaveState>({
    lastGraphSignature: "",
    lastBufferSignature: "",
    lastPersistSignature: "",
    cachedBuffers: undefined,
    fullWrites: 0,
    cameraWrites: 0,
    skippedWrites: 0,
  });

  useEffect(() => {
    let fullTimer: number | undefined;
    let cameraTimer: number | undefined;

    const state = autosaveRef.current;

    const maybeReportStats = () => {
      const total = state.fullWrites + state.cameraWrites + state.skippedWrites;
      if (total === 0 || total % statsLogInterval !== 0) return;

      postToExtension({
        type: "log",
        level: "info",
        message: `autosave full=${state.fullWrites} camera=${state.cameraWrites} skipped=${state.skippedWrites}`,
      });
    };

    const persist = (mode: "full" | "camera") => {
      const graph = useGraphStore.getState();
      const cam = useViewportStore.getState();

      const graphSignature = buildGraphSignature(graph.nodes, graph.edges);
      const cameraSignature = buildCameraSignature(cam.x, cam.y, cam.zoom);

      let buffers = state.cachedBuffers;
      let bufferSignature = state.lastBufferSignature;
      const needsBufferRefresh =
        mode === "full" ||
        state.lastGraphSignature.length === 0 ||
        state.lastGraphSignature !== graphSignature;

      if (needsBufferRefresh) {
        buffers = collectLayoutBuffers(graph.nodes.map((node) => node.fileUri));
        bufferSignature = buildBufferSignature(buffers);
        state.cachedBuffers = buffers;
        state.lastBufferSignature = bufferSignature;
        state.lastGraphSignature = graphSignature;
      }

      const persistSignature = `${graphSignature}#${cameraSignature}#${bufferSignature}`;
      if (persistSignature === state.lastPersistSignature) {
        state.skippedWrites += 1;
        maybeReportStats();
        return;
      }

      postToExtension({
        type: "saveLayout",
        snapshot: {
          nodes: graph.nodes,
          edges: graph.edges,
          camera: { x: cam.x, y: cam.y, zoom: cam.zoom },
          ...(buffers ? { buffers } : {}),
        },
      });

      state.lastPersistSignature = persistSignature;
      if (mode === "camera") state.cameraWrites += 1;
      else state.fullWrites += 1;
      maybeReportStats();
    };

    const schedulePersist = (mode: "full" | "camera") => {
      if (mode === "full") {
        if (fullTimer !== undefined) window.clearTimeout(fullTimer);
        fullTimer = window.setTimeout(() => persist("full"), fullDebounceMs);
        return;
      }

      if (cameraTimer !== undefined) window.clearTimeout(cameraTimer);
      cameraTimer = window.setTimeout(
        () => persist("camera"),
        cameraDebounceMs,
      );
    };

    let lastNodes = useGraphStore.getState().nodes;
    let lastEdges = useGraphStore.getState().edges;
    const unsubscribeGraph = useGraphStore.subscribe((graphState) => {
      if (graphState.nodes === lastNodes && graphState.edges === lastEdges) {
        return;
      }
      lastNodes = graphState.nodes;
      lastEdges = graphState.edges;
      schedulePersist("full");
    });

    let lastX = useViewportStore.getState().x;
    let lastY = useViewportStore.getState().y;
    let lastZoom = useViewportStore.getState().zoom;
    const unsubscribeViewport = useViewportStore.subscribe((viewportState) => {
      if (
        viewportState.x === lastX &&
        viewportState.y === lastY &&
        viewportState.zoom === lastZoom
      ) {
        return;
      }
      lastX = viewportState.x;
      lastY = viewportState.y;
      lastZoom = viewportState.zoom;
      schedulePersist("camera");
    });

    return () => {
      unsubscribeGraph();
      unsubscribeViewport();
      if (fullTimer !== undefined) window.clearTimeout(fullTimer);
      if (cameraTimer !== undefined) window.clearTimeout(cameraTimer);
    };
  }, [cameraDebounceMs, fullDebounceMs, statsLogInterval]);
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CanvasCommand,
  CanvasEdge,
  CanvasNode,
  EditorBufferSnapshot,
} from "@shared/protocol";
import { Canvas } from "./canvas/Canvas";
import {
  onExtensionMessage,
  patchWebviewState,
  postToExtension,
  readWebviewState,
} from "./bridge/vscode";
import { IntelligenceToast } from "./components/IntelligenceToast";
import { NodeSwitcher } from "./components/NodeSwitcher";
import { OnboardingTips } from "./components/OnboardingTips";
import { ProblemsPanel, type ProblemItem } from "./components/ProblemsPanel";
import { Toolbar } from "./components/Toolbar";
import { findFirstAvailableVerticalSlot } from "./graph/placement";
import { getShortcutHints } from "./keyboard/shortcuts";
import {
  emitFitNodes,
  emitFocusNode,
  emitZoomToFit,
} from "./navigation/events";
import { useGraphStore } from "./state/graphStore";
import {
  REFERENCE_CLICK_MODES,
  type ReferenceClickMode,
  useInteractionStore,
} from "./state/interactionStore";
import { useDiagnosticsStore } from "./state/diagnosticsStore";
import { useIntelligenceStore } from "./state/intelligenceStore";
import { useViewportStore } from "./state/viewportStore";
import { useEditorSettingsStore } from "./state/editorSettingsStore";
import {
  collectLayoutBuffers,
  rememberLayoutBuffers,
} from "./nodes/editorBufferStore";
import { isPendingWebviewOpenRequest } from "./nodes/openRequestTracker";
import { pushEditorSettings } from "./monaco/editorConfig";
import { ensureMonacoRuntime, queueMonacoTheme } from "./monaco/runtime";

const AUTOSAVE_FULL_DEBOUNCE_MS = 550;
const AUTOSAVE_CAMERA_DEBOUNCE_MS = 240;
const AUTOSAVE_STATS_LOG_INTERVAL = 25;
const COMMAND_OPEN_VIEWPORT_BATCH_MS = 80;
const ONBOARDING_SEEN_KEY = "onboardingSeen";
const ONBOARDING_DISMISSED_KEY = "onboardingDismissed";

type LayoutBuffers = Record<string, EditorBufferSnapshot> | undefined;

interface AppPersistedState {
  onboardingSeen?: boolean;
  onboardingDismissed?: boolean;
  referenceClickMode?: ReferenceClickMode;
}

const REFERENCE_CLICK_MODE_SET = new Set<string>(REFERENCE_CLICK_MODES);

export function App() {
  const hydrate = useGraphStore((s) => s.hydrate);
  const nodes = useGraphStore((s) => s.nodes);
  const mruNodeOrder = useGraphStore((s) => s.mruNodeOrder);
  const setSettings = useGraphStore((s) => s.setSettings);
  const upsertNode = useGraphStore((s) => s.upsertNode);
  const removeNode = useGraphStore((s) => s.removeNode);
  const toggleNodeExpandedSize = useGraphStore((s) => s.toggleNodeExpandedSize);
  const snapToGrid = useInteractionStore((s) => s.snapToGrid);
  const toggleSnapToGrid = useInteractionStore((s) => s.toggleSnapToGrid);
  const referenceClickMode = useInteractionStore((s) => s.referenceClickMode);
  const setReferenceClickMode = useInteractionStore(
    (s) => s.setReferenceClickMode,
  );
  const toggleReferenceClickMode = useInteractionStore(
    (s) => s.toggleReferenceClickMode,
  );
  const diagnosticsByUri = useDiagnosticsStore((s) => s.byUri);
  const timeoutNotice = useIntelligenceStore((s) => s.timeoutNotice);
  const retryTimeoutNotice = useIntelligenceStore((s) => s.retryTimeoutNotice);
  const dismissTimeoutNotice = useIntelligenceStore(
    (s) => s.dismissTimeoutNotice,
  );
  const zoom = useViewportStore((s) => s.zoom);
  const setEditorSettings = useEditorSettingsStore((s) => s.set);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showNodeSwitcher, setShowNodeSwitcher] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    const state = readWebviewState<AppPersistedState>();
    return (
      state?.onboardingDismissed !== true && state?.onboardingSeen !== true
    );
  });
  const autosaveRef = useRef({
    lastGraphSignature: "",
    lastBufferSignature: "",
    lastPersistSignature: "",
    cachedBuffers: undefined as LayoutBuffers,
    fullWrites: 0,
    cameraWrites: 0,
    skippedWrites: 0,
  });
  const commandOpenViewportBatchRef = useRef<{
    nodeIds: string[];
    timer: number | null;
  }>({
    nodeIds: [],
    timer: null,
  });

  const openFile = useCallback(() => {
    postToExtension({
      type: "requestOpenDialog",
      options: { pathFirst: true },
    });
  }, []);

  const openManyFiles = useCallback(() => {
    postToExtension({
      type: "requestOpenDialog",
      options: { allowMultiSelect: true, pathFirst: true },
    });
  }, []);

  const openNodeSwitcher = useCallback(() => {
    if (useGraphStore.getState().nodes.length === 0) return;
    setShowNodeSwitcher(true);
  }, []);

  const closeNodeSwitcher = useCallback(() => {
    setShowNodeSwitcher(false);
  }, []);

  const toggleProblems = useCallback(() => {
    setShowProblems((visible) => !visible);
  }, []);

  const closeProblems = useCallback(() => {
    setShowProblems(false);
  }, []);

  const toggleOnboarding = useCallback(() => {
    setShowOnboarding((visible) => !visible);
  }, []);

  const closeOnboarding = useCallback(() => {
    patchWebviewState({ [ONBOARDING_SEEN_KEY]: true });
    setShowOnboarding(false);
  }, []);

  const dismissOnboardingForever = useCallback(() => {
    patchWebviewState({
      [ONBOARDING_SEEN_KEY]: true,
      [ONBOARDING_DISMISSED_KEY]: true,
    });
    setShowOnboarding(false);
  }, []);

  const selectNodeFromSwitcher = useCallback((nodeId: string) => {
    useGraphStore.getState().focusNode(nodeId);
    emitFocusNode({ nodeId, recordHistory: false });
    setShowNodeSwitcher(false);
  }, []);

  const saveLayout = useCallback(() => {
    postToExtension({ type: "requestSaveNamedLayout" });
  }, []);

  const loadLayout = useCallback(() => {
    postToExtension({ type: "requestLoadNamedLayout" });
  }, []);

  const zoomToFit = useCallback(() => {
    emitZoomToFit();
  }, []);

  const focusNextNode = useCallback(() => {
    const nodeId = useGraphStore.getState().focusNextNode();
    if (!nodeId) return;
    emitFocusNode({ nodeId, recordHistory: false });
  }, []);

  const focusPreviousNode = useCallback(() => {
    const nodeId = useGraphStore.getState().focusPreviousNode();
    if (!nodeId) return;
    emitFocusNode({ nodeId, recordHistory: false });
  }, []);

  const openFocusedNodeInWorkbench = useCallback(() => {
    const graph = useGraphStore.getState();
    const focusedNodeId = graph.focusedNodeId;
    if (!focusedNodeId) return;
    const node = graph.findById(focusedNodeId);
    if (!node) return;
    postToExtension({ type: "revealInWorkbench", fileUri: node.fileUri });
  }, []);

  const closeFocusedNode = useCallback(() => {
    const focusedNodeId = useGraphStore.getState().focusedNodeId;
    if (!focusedNodeId) return;
    removeNode(focusedNodeId);
  }, [removeNode]);

  const toggleFocusedNodeSize = useCallback(() => {
    const focusedNodeId = useGraphStore.getState().focusedNodeId;
    if (!focusedNodeId) return;
    toggleNodeExpandedSize(focusedNodeId);
    emitFocusNode({
      nodeId: focusedNodeId,
      recordHistory: false,
      preserveZoom: true,
    });
  }, [toggleNodeExpandedSize]);

  const toggleShortcuts = useCallback(() => {
    setShowShortcuts((visible) => !visible);
  }, []);

  const closeShortcuts = useCallback(() => {
    setShowShortcuts(false);
  }, []);

  const toggleSnapToGridAction = useCallback(() => {
    toggleSnapToGrid();
  }, [toggleSnapToGrid]);

  const setReferenceClickModeAction = useCallback(
    (mode: ReferenceClickMode) => {
      setReferenceClickMode(mode);
    },
    [setReferenceClickMode],
  );

  const toggleReferenceClickModeAction = useCallback(() => {
    toggleReferenceClickMode();
  }, [toggleReferenceClickMode]);

  const handleCanvasCommand = useCallback(
    (command: CanvasCommand) => {
      switch (command) {
        case "openFile":
          openFile();
          return;
        case "openManyFiles":
          openManyFiles();
          return;
        case "openNodeSwitcher":
          openNodeSwitcher();
          return;
        case "focusNextNode":
          focusNextNode();
          return;
        case "focusPreviousNode":
          focusPreviousNode();
          return;
        case "openFocusedNodeInWorkbench":
          openFocusedNodeInWorkbench();
          return;
        case "closeFocusedNode":
          closeFocusedNode();
          return;
        case "toggleFocusedNodeSize":
          toggleFocusedNodeSize();
          return;
        case "toggleSnapToGrid":
          toggleSnapToGridAction();
          return;
        case "toggleReferenceClickMode":
          toggleReferenceClickModeAction();
          return;
        case "toggleProblemsPanel":
          toggleProblems();
          return;
        case "toggleShortcutHelp":
          toggleShortcuts();
          return;
        case "zoomToFit":
        case "requestSaveLayout":
          return;
      }
    },
    [
      focusNextNode,
      focusPreviousNode,
      openFocusedNodeInWorkbench,
      closeFocusedNode,
      toggleFocusedNodeSize,
      openManyFiles,
      openNodeSwitcher,
      openFile,
      toggleProblems,
      toggleReferenceClickModeAction,
      toggleSnapToGridAction,
      toggleShortcuts,
    ],
  );

  const onSelectProblem = useCallback((item: ProblemItem) => {
    useGraphStore.getState().focusNode(item.nodeId);
    emitFocusNode({ nodeId: item.nodeId, recordHistory: false });
    setShowProblems(false);
  }, []);

  const shortcutHints = useMemo(() => getShortcutHints(), []);

  const switchableNodes = useMemo(() => {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const ordered: { id: string; fileUri: string }[] = [];

    for (const id of mruNodeOrder) {
      const node = nodeMap.get(id);
      if (!node) continue;
      ordered.push({ id: node.id, fileUri: node.fileUri });
      nodeMap.delete(id);
    }
    for (const node of nodes) {
      if (!nodeMap.has(node.id)) continue;
      ordered.push({ id: node.id, fileUri: node.fileUri });
      nodeMap.delete(node.id);
    }

    return ordered;
  }, [mruNodeOrder, nodes]);

  const diagnosticsSummary = useMemo(() => {
    const nodeByUri = new Map(nodes.map((node) => [node.fileUri, node]));
    const items: ProblemItem[] = [];
    let errorCount = 0;
    let warningCount = 0;
    let infoCount = 0;
    let hintCount = 0;

    for (const [fileUri, node] of nodeByUri.entries()) {
      const entry = diagnosticsByUri[fileUri];
      if (!entry) continue;

      errorCount += entry.counts.errors;
      warningCount += entry.counts.warnings;
      infoCount += entry.counts.infos;
      hintCount += entry.counts.hints;

      entry.markers.forEach((marker, markerIndex) => {
        items.push({
          id: `${node.id}:${markerIndex}`,
          nodeId: node.id,
          fileUri,
          marker,
        });
      });
    }

    items.sort((a, b) => {
      const severityDiff = b.marker.severity - a.marker.severity;
      if (severityDiff !== 0) return severityDiff;
      const fileDiff = a.fileUri.localeCompare(b.fileUri);
      if (fileDiff !== 0) return fileDiff;
      const lineDiff = a.marker.startLine - b.marker.startLine;
      if (lineDiff !== 0) return lineDiff;
      return a.marker.startCharacter - b.marker.startCharacter;
    });

    return {
      items,
      errorCount,
      warningCount,
      infoCount,
      hintCount,
      totalCount: errorCount + warningCount + infoCount + hintCount,
    };
  }, [diagnosticsByUri, nodes]);

  const canCycleNodes = nodes.length > 0;

  useEffect(() => {
    if (nodes.length === 0) return;
    void ensureMonacoRuntime();
  }, [nodes.length]);

  const queueCommandOpenViewportUpdate = useCallback((nodeId: string) => {
    const batch = commandOpenViewportBatchRef.current;
    if (!batch.nodeIds.includes(nodeId)) {
      batch.nodeIds.push(nodeId);
    }
    if (batch.timer !== null) {
      window.clearTimeout(batch.timer);
    }
    batch.timer = window.setTimeout(() => {
      const nodeIds = batch.nodeIds.slice();
      batch.nodeIds = [];
      batch.timer = null;

      if (nodeIds.length === 0) return;
      if (nodeIds.length === 1) {
        emitFocusNode({ nodeId: nodeIds[0], recordHistory: false });
        return;
      }

      emitFitNodes({ nodeIds, padding: 0.3, duration: 320 });
    }, COMMAND_OPEN_VIEWPORT_BATCH_MS);
  }, []);

  useEffect(() => {
    const batch = commandOpenViewportBatchRef.current;
    return () => {
      if (batch.timer !== null) {
        window.clearTimeout(batch.timer);
      }
      batch.nodeIds = [];
      batch.timer = null;
    };
  }, []);

  useEffect(() => {
    const persisted = readWebviewState<AppPersistedState>();
    const mode = persisted?.referenceClickMode;
    if (!mode || !REFERENCE_CLICK_MODE_SET.has(mode)) return;
    setReferenceClickMode(mode);
  }, [setReferenceClickMode]);

  useEffect(() => {
    patchWebviewState({ referenceClickMode });
  }, [referenceClickMode]);

  useEffect(() => {
    const unsubscribe = onExtensionMessage((msg) => {
      if (msg.type === "init") {
        if (msg.theme) queueMonacoTheme(msg.theme);
        if (msg.editorSettings) {
          setEditorSettings(msg.editorSettings);
          pushEditorSettings(msg.editorSettings);
        }
        if (msg.settings) setSettings(msg.settings);
        if (msg.layout) {
          rememberLayoutBuffers(msg.layout.buffers);
          hydrate(msg.layout);
        }
      } else if (msg.type === "themeChanged") {
        queueMonacoTheme(msg.theme);
      } else if (msg.type === "editorSettingsChanged") {
        setEditorSettings(msg.editorSettings);
        pushEditorSettings(msg.editorSettings);
      } else if (msg.type === "diagnostics") {
        useDiagnosticsStore.getState().setDiagnostics(msg.uri, msg.markers);
      } else if (msg.type === "openFileResult") {
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
      } else if (msg.type === "command") {
        handleCanvasCommand(msg.command);
      }
    });
    postToExtension({ type: "ready" });
    return unsubscribe;
  }, [
    handleCanvasCommand,
    hydrate,
    queueCommandOpenViewportUpdate,
    setSettings,
    upsertNode,
    setEditorSettings,
  ]);

  useEffect(() => {
    if (
      !showShortcuts &&
      !showNodeSwitcher &&
      !showProblems &&
      !showOnboarding
    ) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setShowShortcuts(false);
      setShowNodeSwitcher(false);
      setShowProblems(false);
      if (showOnboarding) closeOnboarding();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    closeOnboarding,
    showNodeSwitcher,
    showOnboarding,
    showProblems,
    showShortcuts,
  ]);

  // Debounced auto-save with split graph/camera paths and payload dedupe.
  useEffect(() => {
    let fullTimer: number | undefined;
    let cameraTimer: number | undefined;

    const state = autosaveRef.current;
    const maybeReportStats = () => {
      const total = state.fullWrites + state.cameraWrites + state.skippedWrites;
      if (total === 0 || total % AUTOSAVE_STATS_LOG_INTERVAL !== 0) return;
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
        fullTimer = window.setTimeout(
          () => persist("full"),
          AUTOSAVE_FULL_DEBOUNCE_MS,
        );
        return;
      }

      if (cameraTimer !== undefined) window.clearTimeout(cameraTimer);
      cameraTimer = window.setTimeout(
        () => persist("camera"),
        AUTOSAVE_CAMERA_DEBOUNCE_MS,
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
  }, []);

  return (
    <>
      <Toolbar
        nodeCount={nodes.length}
        problemCount={diagnosticsSummary.totalCount}
        errorCount={diagnosticsSummary.errorCount}
        warningCount={diagnosticsSummary.warningCount}
        zoom={zoom}
        snapToGrid={snapToGrid}
        referenceClickMode={referenceClickMode}
        showShortcuts={showShortcuts}
        showProblems={showProblems}
        shortcuts={shortcutHints}
        onOpenFile={openFile}
        onOpenManyFiles={openManyFiles}
        onOpenNodeSwitcher={openNodeSwitcher}
        onSaveLayout={saveLayout}
        onLoadLayout={loadLayout}
        onNextNode={focusNextNode}
        onPreviousNode={focusPreviousNode}
        onZoomToFit={zoomToFit}
        onToggleSnapToGrid={toggleSnapToGridAction}
        onReferenceClickModeChange={setReferenceClickModeAction}
        onToggleProblems={toggleProblems}
        onToggleShortcuts={toggleShortcuts}
        onToggleOnboarding={toggleOnboarding}
        onCloseShortcuts={closeShortcuts}
        canCycleNodes={canCycleNodes}
        showOnboarding={showOnboarding}
      />
      <OnboardingTips
        open={showOnboarding}
        shortcuts={shortcutHints}
        onClose={closeOnboarding}
        onDismissForever={dismissOnboardingForever}
      />
      <NodeSwitcher
        open={showNodeSwitcher}
        nodes={switchableNodes}
        onSelect={selectNodeFromSwitcher}
        onClose={closeNodeSwitcher}
      />
      <ProblemsPanel
        open={showProblems}
        items={diagnosticsSummary.items}
        errorCount={diagnosticsSummary.errorCount}
        warningCount={diagnosticsSummary.warningCount}
        infoCount={diagnosticsSummary.infoCount}
        hintCount={diagnosticsSummary.hintCount}
        onSelectProblem={onSelectProblem}
        onClose={closeProblems}
      />
      <IntelligenceToast
        notice={timeoutNotice}
        onRetry={retryTimeoutNotice}
        onDismiss={dismissTimeoutNotice}
      />
      <Canvas />
    </>
  );
}

function buildGraphSignature(nodes: CanvasNode[], edges: CanvasEdge[]): string {
  const nodeSignature = nodes
    .map((node) =>
      [
        node.id,
        node.fileUri,
        round(node.x, 2),
        round(node.y, 2),
        round(node.width, 2),
        round(node.height, 2),
        node.revealRange
          ? `${node.revealRange.startLine}:${node.revealRange.startCharacter}:${node.revealRange.endLine}:${node.revealRange.endCharacter}`
          : "",
      ].join("|"),
    )
    .join(";");
  const edgeSignature = edges
    .map((edge) => [edge.id, edge.source, edge.target, edge.type].join("|"))
    .join(";");
  return `${nodeSignature}::${edgeSignature}`;
}

function buildCameraSignature(x: number, y: number, zoom: number): string {
  return `${round(x, 3)}|${round(y, 3)}|${round(zoom, 4)}`;
}

function buildBufferSignature(buffers: LayoutBuffers): string {
  if (!buffers) return "";
  return Object.keys(buffers)
    .sort((a, b) => a.localeCompare(b))
    .map((fileUri) => {
      const buffer = buffers[fileUri];
      return `${fileUri}:${buffer.languageId}:${buffer.isDirty ? 1 : 0}:${hashString(buffer.content)}`;
    })
    .join(";");
}

function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return `${value.length}:${hash >>> 0}`;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

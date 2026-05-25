import { useCallback, useEffect, useMemo, useState } from "react";
import type { CanvasCommand, SavedLayoutSummary } from "@shared/protocol";
import { Canvas } from "./canvas/Canvas";
import {
  patchWebviewState,
  postToExtension,
  readWebviewState,
} from "./bridge/vscode";
import { IntelligenceToast } from "./components/IntelligenceToast";
import { NodeSwitcher } from "./components/NodeSwitcher";
import { OnboardingTips } from "./components/OnboardingTips";
import { ProblemsPanel, type ProblemItem } from "./components/ProblemsPanel";
import { Toolbar } from "./components/Toolbar";
import { useCommandOpenViewportBatch } from "./hooks/useCommandOpenViewportBatch";
import { useExtensionMessages } from "./hooks/useExtensionMessages";
import { useLayoutAutosave } from "./hooks/useLayoutAutosave";
import { getShortcutHints } from "./keyboard/shortcuts";
import { ensureMonacoRuntime } from "./monaco/runtime";
import { emitFocusNode, emitZoomToFit } from "./navigation/events";
import {
  type ReferenceClickMode,
  useInteractionStore,
} from "./state/interactionStore";
import { useDiagnosticsStore } from "./state/diagnosticsStore";
import { useGraphStore } from "./state/graphStore";
import { useIntelligenceStore } from "./state/intelligenceStore";
import { useViewportStore } from "./state/viewportStore";
import { useEditorSettingsStore } from "./state/editorSettingsStore";

const ONBOARDING_SEEN_KEY = "onboardingSeen";
const ONBOARDING_DISMISSED_KEY = "onboardingDismissed";

interface AppPersistedState {
  onboardingSeen?: boolean;
  onboardingDismissed?: boolean;
}

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
  const [savedLayouts, setSavedLayouts] = useState<SavedLayoutSummary[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    const state = readWebviewState<AppPersistedState>();
    return (
      state?.onboardingDismissed !== true && state?.onboardingSeen !== true
    );
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

  const loadLayout = useCallback((name: string) => {
    postToExtension({ type: "loadNamedLayout", name });
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
    const graph = useGraphStore.getState();
    if (graph.nodes.length === 0) {
      postToExtension({ type: "requestCloseCanvasTab" });
      return;
    }
    const focusedNodeId = graph.focusedNodeId;
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
      postToExtension({ type: "setReferenceClickMode", mode });
    },
    [setReferenceClickMode],
  );

  const toggleReferenceClickModeAction = useCallback(() => {
    toggleReferenceClickMode();
    postToExtension({
      type: "setReferenceClickMode",
      mode: useInteractionStore.getState().referenceClickMode,
    });
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
  const queueCommandOpenViewportUpdate = useCommandOpenViewportBatch();

  useEffect(() => {
    if (nodes.length === 0) return;
    void ensureMonacoRuntime();
  }, [nodes.length]);

  useExtensionMessages({
    handleCanvasCommand,
    hydrate,
    setSavedLayouts,
    setSettings,
    upsertNode,
    setEditorSettings,
    setReferenceClickMode,
    queueCommandOpenViewportUpdate,
  });

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

  useLayoutAutosave();

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
        savedLayouts={savedLayouts}
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

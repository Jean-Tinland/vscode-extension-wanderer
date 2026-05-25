import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import classNames from "classnames";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Node as RFNode,
  type Edge as RFEdge,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
  type ReactFlowInstance,
  applyNodeChanges,
  ReactFlowProvider,
  useReactFlow,
  type NodeDimensionChange,
  type Viewport,
} from "reactflow";
import { useGraphStore } from "../state/graphStore";
import { useInteractionStore } from "../state/interactionStore";
import { useViewportStore } from "../state/viewportStore";
import { collectLayoutBuffers } from "../nodes/editorBufferStore";
import type { EditorNodeData } from "../nodes/EditorNode";
import { onFitNodes, onFocusNode, onZoomToFit } from "../navigation/events";
import { onExtensionMessage, postToExtension } from "../bridge/vscode";
import { DOM_SELECTORS } from "../domHooks";
import styles from "../styles/canvas.module.css";
import reactflowStyles from "../styles/reactflow.module.css";

const LazyEditorNode = lazy(async () => {
  const module = await import("../nodes/EditorNode");
  return { default: module.EditorNode };
});

function LazyEditorNodeWrapper(props: NodeProps<EditorNodeData>) {
  return (
    <Suspense fallback={<pre className={styles.preview}>Loading…</pre>}>
      <LazyEditorNode {...props} />
    </Suspense>
  );
}

const nodeTypes: NodeTypes = { editor: LazyEditorNodeWrapper };

interface ActivePanSession {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startViewportX: number;
  startViewportY: number;
  startZoom: number;
}

const FIT_MAX_WAIT_MS = 2400;

function CanvasInner() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const updateNodePosition = useGraphStore((s) => s.updateNodePosition);
  const updateNodeSize = useGraphStore((s) => s.updateNodeSize);
  const clearFocus = useGraphStore((s) => s.clearFocus);
  const focusNode = useGraphStore((s) => s.focusNode);
  const focusedNodeId = useGraphStore((s) => s.focusedNodeId);
  const setViewport = useViewportStore((s) => s.set);
  const initialViewport = useViewportStore.getState();
  const snapToGrid = useInteractionStore((s) => s.snapToGrid);
  const gridSize = useInteractionStore((s) => s.gridSize);
  const rf = useReactFlow();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<ReactFlowInstance | null>(null);
  const activePanRef = useRef<ActivePanSession | null>(null);
  const viewportRef = useRef<Viewport>({
    x: initialViewport.x,
    y: initialViewport.y,
    zoom: initialViewport.zoom,
  });
  const pendingViewportRef = useRef<Viewport | null>(null);
  const panRafRef = useRef<number | null>(null);
  const wheelAccumRef = useRef<{ dx: number; dy: number } | null>(null);
  const wheelRafRef = useRef<number | null>(null);
  const fitRafRef = useRef<number | null>(null);
  const initialAutoFitDoneRef = useRef(false);
  const [panSessionActive, setPanSessionActive] = useState(false);
  const panMode = panSessionActive;

  const fitNodesWithRetry = useCallback(
    (detail: { nodeIds: string[]; padding?: number; duration?: number }) => {
      const targetIds = Array.from(
        new Set(detail.nodeIds.filter((id) => id.length > 0)),
      );
      if (targetIds.length === 0) return;

      if (fitRafRef.current !== null) {
        window.cancelAnimationFrame(fitRafRef.current);
        fitRafRef.current = null;
      }

      const padding = detail.padding ?? 0.3;
      const duration = detail.duration ?? 320;
      const startedAt = performance.now();

      const runFitAttempt = () => {
        const readyTargetIds = resolveReadyFitNodeIds(
          rf,
          canvasRef.current,
          targetIds,
        );

        if (readyTargetIds.length === targetIds.length) {
          rf.fitView({
            nodes: readyTargetIds.map((id) => ({ id })),
            padding,
            duration,
          });
          fitRafRef.current = null;
          return;
        }

        if (performance.now() - startedAt >= FIT_MAX_WAIT_MS) {
          if (readyTargetIds.length > 0) {
            rf.fitView({
              nodes: readyTargetIds.map((id) => ({ id })),
              padding,
              duration,
            });
          }
          fitRafRef.current = null;
          return;
        }

        fitRafRef.current = window.requestAnimationFrame(runFitAttempt);
      };

      fitRafRef.current = window.requestAnimationFrame(runFitAttempt);
    },
    [rf],
  );

  const queueViewport = useCallback(
    (next: Viewport) => {
      pendingViewportRef.current = next;
      if (panRafRef.current !== null) return;
      panRafRef.current = window.requestAnimationFrame(() => {
        panRafRef.current = null;
        const queued = pendingViewportRef.current;
        pendingViewportRef.current = null;
        if (!queued) return;
        viewportRef.current = queued;
        setViewport(queued.x, queued.y, queued.zoom);
        void rf.setViewport(queued);
      });
    },
    [rf, setViewport],
  );

  const endPanSession = useCallback((pointerId?: number) => {
    const active = activePanRef.current;
    if (!active) return;
    if (typeof pointerId === "number" && pointerId !== active.pointerId) {
      return;
    }
    activePanRef.current = null;
    setPanSessionActive(false);
  }, []);

  const rfNodes: RFNode<EditorNodeData>[] = useMemo(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: "editor",
        position: { x: n.x, y: n.y },
        data: { nodeId: n.id, fileUri: n.fileUri },
        style: { width: n.width, height: n.height },
        dragHandle: DOM_SELECTORS.nodeDragHandle,
        zIndex: n.id === focusedNodeId ? 1000 : 0,
      })),
    [focusedNodeId, nodes],
  );

  const rfEdges: RFEdge[] = useMemo(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: "default",
        animated: e.type === "definition",
        style: { stroke: e.type === "definition" ? "#4ea1ff" : "#888" },
      })),
    [edges],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const next = applyNodeChanges(changes, rfNodes);
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          const x = snapToGrid
            ? snapValue(change.position.x, gridSize)
            : change.position.x;
          const y = snapToGrid
            ? snapValue(change.position.y, gridSize)
            : change.position.y;
          updateNodePosition(change.id, x, y);
        } else if (change.type === "dimensions" && change.resizing === false) {
          const dc = change as NodeDimensionChange;
          const dims = dc.dimensions;
          if (dims) {
            updateNodeSize(change.id, dims.width, dims.height);
          }
        }
      }
      void next;
    },
    [gridSize, rfNodes, snapToGrid, updateNodePosition, updateNodeSize],
  );

  // Listen for extension-side commands like "zoomToFit".
  useEffect(() => {
    return onExtensionMessage((msg) => {
      if (msg.type === "command" && msg.command === "zoomToFit") {
        rf.fitView({ padding: 0.2, duration: 400 });
      } else if (
        msg.type === "command" &&
        msg.command === "requestSaveLayout"
      ) {
        const cam = useViewportStore.getState();
        const baseSnapshot = useGraphStore
          .getState()
          .snapshot({ x: cam.x, y: cam.y, zoom: cam.zoom });
        const snapshot = {
          ...baseSnapshot,
          buffers: collectLayoutBuffers(
            baseSnapshot.nodes.map((node) => node.fileUri),
          ),
        };
        postToExtension({
          type: "saveLayout",
          snapshot,
        });
      }
    });
  }, [rf]);

  useEffect(() => {
    return onZoomToFit(() => {
      rf.fitView({ padding: 0.2, duration: 400 });
    });
  }, [rf]);

  // Listen for programmatic "focus a specific node" requests.
  useEffect(() => {
    return onFocusNode(({ nodeId, recordHistory, preserveZoom }) => {
      const node = useGraphStore.getState().findById(nodeId);
      if (!node) return;
      focusNode(nodeId, { recordHistory });
      if (preserveZoom) {
        const zoom = viewportRef.current.zoom;
        void rf.setCenter(node.x + node.width / 2, node.y + node.height / 2, {
          zoom,
          duration: 220,
        });
        return;
      }
      rf.fitView({ nodes: [{ id: nodeId }], padding: 0.5, duration: 300 });
    });
  }, [focusNode, rf]);

  useEffect(() => {
    return onFitNodes((detail) => {
      fitNodesWithRetry(detail);
    });
  }, [fitNodesWithRetry]);

  useEffect(() => {
    if (initialAutoFitDoneRef.current) return;
    if (nodes.length === 0) return;

    initialAutoFitDoneRef.current = true;
    fitNodesWithRetry({
      nodeIds: nodes.map((node) => node.id),
      padding: 0.2,
      duration: 0,
    });
  }, [fitNodesWithRetry, nodes]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented) return;

      const target = event.target;
      if (target instanceof Element) {
        if (target.closest(DOM_SELECTORS.nodeSwitcher)) return;
        if (target.closest(DOM_SELECTORS.shortcuts)) return;
        if (target.closest(DOM_SELECTORS.onboarding)) return;
        if (target.closest(DOM_SELECTORS.problems)) return;
      }

      if (useGraphStore.getState().focusedNodeId === null) return;
      event.preventDefault();
      clearFocus();
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [clearFocus]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const active = activePanRef.current;
      if (!active || event.pointerId !== active.pointerId) return;

      event.preventDefault();

      const dx = event.clientX - active.startClientX;
      const dy = event.clientY - active.startClientY;

      queueViewport({
        x: active.startViewportX + dx,
        y: active.startViewportY + dy,
        zoom: active.startZoom,
      });
    };

    const onPointerUp = (event: PointerEvent) => {
      endPanSession(event.pointerId);
    };

    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerUp, true);

    return () => {
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerUp, true);
    };
  }, [endPanSession, queueViewport]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (event: WheelEvent) => {
      if (isTextEditingElement(document.activeElement)) return;
      if (!isCanvasWheelPanTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.deltaX === 0 && event.deltaY === 0) return;

      event.preventDefault();

      if (!wheelAccumRef.current) {
        wheelAccumRef.current = { dx: 0, dy: 0 };
      }
      wheelAccumRef.current.dx += event.deltaX;
      wheelAccumRef.current.dy += event.deltaY;

      if (wheelRafRef.current !== null) return;
      wheelRafRef.current = window.requestAnimationFrame(() => {
        wheelRafRef.current = null;
        const delta = wheelAccumRef.current;
        wheelAccumRef.current = null;
        if (!delta) return;
        const viewport = viewportRef.current;
        queueViewport({
          x: viewport.x - delta.dx,
          y: viewport.y - delta.dy,
          zoom: viewport.zoom,
        });
      });
    };

    canvas.addEventListener("wheel", onWheel, {
      capture: true,
      passive: false,
    });

    return () => {
      canvas.removeEventListener("wheel", onWheel, true);
    };
  }, [queueViewport]);

  useEffect(() => {
    if (!panSessionActive) return;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.userSelect = previousUserSelect;
    };
  }, [panSessionActive]);

  useEffect(() => {
    return () => {
      if (wheelRafRef.current !== null) {
        window.cancelAnimationFrame(wheelRafRef.current);
      }
      if (panRafRef.current !== null) {
        window.cancelAnimationFrame(panRafRef.current);
      }
      if (fitRafRef.current !== null) {
        window.cancelAnimationFrame(fitRafRef.current);
      }
      wheelAccumRef.current = null;
      pendingViewportRef.current = null;
      endPanSession();
    };
  }, [endPanSession]);

  const beginPanSession = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button === 0) {
        const target = event.target;
        const focusedNodeId = useGraphStore.getState().focusedNodeId;
        if (
          focusedNodeId !== null &&
          (!(target instanceof Element) ||
            !target.closest(DOM_SELECTORS.focusedNode))
        ) {
          clearFocus();
        }
      }

      if (activePanRef.current) return;

      const startsWithMiddleButton = event.button === 1;
      if (!startsWithMiddleButton) return;

      const viewport = viewportRef.current;
      activePanRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startViewportX: viewport.x,
        startViewportY: viewport.y,
        startZoom: viewport.zoom,
      };
      setPanSessionActive(true);

      event.preventDefault();
      event.stopPropagation();
    },
    [clearFocus],
  );

  const onMove = useCallback(
    (_: unknown, viewport: Viewport) => {
      viewportRef.current = viewport;
      setViewport(viewport.x, viewport.y, viewport.zoom);
    },
    [setViewport],
  );

  return (
    <div
      ref={canvasRef}
      className={classNames(
        styles.canvas,
        reactflowStyles.reactflowScope,
        panMode && styles.canvasPanMode,
      )}
      role="region"
      aria-label="Wanderer canvas"
      onPointerDownCapture={beginPanSession}
      data-canvas="true"
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onMove={onMove}
        onInit={(inst) => {
          instanceRef.current = inst;
        }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        selectionOnDrag={false}
        panOnScroll={false}
        nodesDraggable={!panMode}
        nodesConnectable={false}
        elementsSelectable={false}
        snapToGrid={snapToGrid}
        snapGrid={[gridSize, gridSize]}
        panOnDrag={false}
        panActivationKeyCode={null}
        zoomOnScroll={false}
        zoomOnPinch={true}
      >
        <Background gap={gridSize} size={1} />
        <MiniMap
          pannable
          zoomable
          ariaLabel="Wanderer canvas minimap"
          nodeColor="var(--wanderer-minimap-node-color)"
          nodeStrokeColor="var(--wanderer-minimap-node-stroke)"
          maskColor="var(--wanderer-minimap-mask-color)"
          maskStrokeColor="var(--wanderer-minimap-mask-stroke)"
          maskStrokeWidth={2}
        />
        <Controls
          showInteractive={false}
          aria-label="Wanderer viewport controls"
        />
      </ReactFlow>
    </div>
  );
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}

function snapValue(value: number, gridSize: number): number {
  if (!Number.isFinite(gridSize) || gridSize <= 1) return value;
  return Math.round(value / gridSize) * gridSize;
}

function isCanvasWheelPanTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (!target.closest(DOM_SELECTORS.canvas)) return false;
  if (target.closest(DOM_SELECTORS.focusedNode)) return false;
  if (target.closest(DOM_SELECTORS.inlineChat)) return false;
  if (target.closest(DOM_SELECTORS.nodeSwitcher)) return false;
  if (target.closest(DOM_SELECTORS.shortcuts)) return false;
  if (target.closest(DOM_SELECTORS.onboarding)) return false;
  if (target.closest(DOM_SELECTORS.problems)) return false;
  if (target.closest(DOM_SELECTORS.toolbar)) return false;
  if (target.closest(".react-flow__controls")) return false;
  if (target.closest(".react-flow__minimap")) return false;
  if (isTextEditingElement(target)) return false;

  if (target instanceof HTMLButtonElement) return false;
  if (target instanceof HTMLSelectElement) return false;
  if (target instanceof HTMLTextAreaElement) return false;
  if (target instanceof HTMLInputElement) return false;
  return true;
}

function isTextEditingElement(element: Element | null): boolean {
  if (!element) return false;

  if (element.classList.contains("inputarea")) {
    // Monaco text focus uses a hidden textarea with class "inputarea".
    return true;
  }

  if (element.closest("[contenteditable='true']")) return true;

  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLSelectElement) return true;

  if (element instanceof HTMLInputElement) {
    const type = element.type.toLowerCase();
    return ![
      "button",
      "checkbox",
      "color",
      "file",
      "hidden",
      "image",
      "radio",
      "range",
      "reset",
      "submit",
    ].includes(type);
  }

  return false;
}

function resolveReadyFitNodeIds(
  rf: ReactFlowInstance,
  canvas: HTMLDivElement | null,
  targetIds: string[],
): string[] {
  const renderedNodeIds = new Set(rf.getNodes().map((node) => node.id));
  return targetIds.filter((nodeId) => {
    if (!renderedNodeIds.has(nodeId)) return false;
    return hasRenderedNodeElement(canvas, nodeId);
  });
}

function hasRenderedNodeElement(
  canvas: HTMLDivElement | null,
  nodeId: string,
): boolean {
  if (!canvas) return false;
  const elements = canvas.querySelectorAll<HTMLElement>(".react-flow__node");
  for (const element of elements) {
    if (element.dataset.id !== nodeId) continue;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  return false;
}

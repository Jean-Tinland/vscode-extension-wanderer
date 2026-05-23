export interface FocusNodeEventDetail {
  nodeId: string;
  recordHistory?: boolean;
  preserveZoom?: boolean;
}

export interface FitNodesEventDetail {
  nodeIds: string[];
  padding?: number;
  duration?: number;
}

export interface ZoomToFitNodesOptions {
  padding?: number;
  duration?: number;
}

const FOCUS_NODE_EVENT = "cw:focusNode";
const ZOOM_TO_FIT_EVENT = "cw:zoomToFit";
const FIT_NODES_EVENT = "cw:fitNodes";

export function emitFocusNode(detail: FocusNodeEventDetail): void {
  window.dispatchEvent(
    new CustomEvent<FocusNodeEventDetail>(FOCUS_NODE_EVENT, { detail }),
  );
}

export function onFocusNode(
  handler: (detail: FocusNodeEventDetail) => void,
): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<FocusNodeEventDetail>).detail;
    if (!detail?.nodeId) return;
    handler(detail);
  };
  window.addEventListener(FOCUS_NODE_EVENT, listener);
  return () => window.removeEventListener(FOCUS_NODE_EVENT, listener);
}

export function emitZoomToFit(): void {
  window.dispatchEvent(new CustomEvent(ZOOM_TO_FIT_EVENT));
}

export function onZoomToFit(handler: () => void): () => void {
  window.addEventListener(ZOOM_TO_FIT_EVENT, handler);
  return () => window.removeEventListener(ZOOM_TO_FIT_EVENT, handler);
}

export function emitFitNodes(detail: FitNodesEventDetail): void {
  if (!Array.isArray(detail.nodeIds) || detail.nodeIds.length === 0) return;
  window.dispatchEvent(
    new CustomEvent<FitNodesEventDetail>(FIT_NODES_EVENT, { detail }),
  );
}

/**
 * Request a zoom-to-fit operation for a node collection.
 * Normalizes node ids so callers can pass raw results safely.
 */
export function zoomToFitNodes(
  nodeIds: string[],
  options: ZoomToFitNodesOptions = {},
): void {
  const normalizedNodeIds = Array.from(
    new Set(
      nodeIds.filter(
        (nodeId): nodeId is string =>
          typeof nodeId === "string" && nodeId.trim().length > 0,
      ),
    ),
  );
  if (normalizedNodeIds.length === 0) return;
  emitFitNodes({
    nodeIds: normalizedNodeIds,
    padding: options.padding,
    duration: options.duration,
  });
}

export function onFitNodes(
  handler: (detail: FitNodesEventDetail) => void,
): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<FitNodesEventDetail>).detail;
    if (!Array.isArray(detail?.nodeIds) || detail.nodeIds.length === 0) return;
    handler(detail);
  };
  window.addEventListener(FIT_NODES_EVENT, listener);
  return () => window.removeEventListener(FIT_NODES_EVENT, listener);
}

import { create } from "zustand";
import type {
  CanvasEdge,
  CanvasNode,
  CanvasSettings,
  GraphSnapshot,
} from "@shared/protocol";

interface FocusOptions {
  recordHistory?: boolean;
}

interface GraphState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  settings: CanvasSettings;
  focusedNodeId: string | null;
  mruNodeOrder: string[];
  setSettings: (s: CanvasSettings) => void;
  clearFocus: () => void;
  upsertNode: (n: CanvasNode) => void;
  updateNodePosition: (id: string, x: number, y: number) => void;
  updateNodeSize: (id: string, width: number, height: number) => void;
  toggleNodeExpandedSize: (id: string) => void;
  resizeNode: (
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => void;
  removeNode: (id: string) => void;
  addEdge: (e: CanvasEdge) => void;
  hydrate: (snapshot: GraphSnapshot | null) => void;
  snapshot: (camera: { x: number; y: number; zoom: number }) => GraphSnapshot;
  findById: (id: string) => CanvasNode | undefined;
  focusNode: (id: string, options?: FocusOptions) => void;
  focusNextNode: () => string | null;
  focusPreviousNode: () => string | null;
}

const defaultSettings: CanvasSettings = {
  horizontalGap: 120,
  verticalStack: 40,
  defaultWidth: 520,
  defaultHeight: 360,
};

const EXPANDED_WIDTH_SCALE = 1.6;
const EXPANDED_HEIGHT_SCALE = 1.5;
const EXPANDED_WIDTH_DELTA = 220;
const EXPANDED_HEIGHT_DELTA = 140;

function getExpandedNodeSize(settings: CanvasSettings): {
  width: number;
  height: number;
} {
  return {
    width: Math.max(
      settings.defaultWidth + EXPANDED_WIDTH_DELTA,
      Math.round(settings.defaultWidth * EXPANDED_WIDTH_SCALE),
    ),
    height: Math.max(
      settings.defaultHeight + EXPANDED_HEIGHT_DELTA,
      Math.round(settings.defaultHeight * EXPANDED_HEIGHT_SCALE),
    ),
  };
}

export function isNodeExpandedSize(
  node: CanvasNode,
  settings: CanvasSettings,
): boolean {
  const expanded = getExpandedNodeSize(settings);
  return node.width >= expanded.width && node.height >= expanded.height;
}

function pruneIds(ids: string[], valid: Set<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!valid.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function bumpMru(order: string[], id: string, valid: Set<string>): string[] {
  return [id, ...pruneIds(order, valid).filter((item) => item !== id)];
}

function orderedNodeIds(nodes: CanvasNode[], mru: string[]): string[] {
  const nodeIds = nodes.map((node) => node.id);
  const valid = new Set(nodeIds);
  const ordered = pruneIds(mru, valid);
  const seen = new Set(ordered);
  for (const id of nodeIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  return ordered;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  edges: [],
  settings: defaultSettings,
  focusedNodeId: null,
  mruNodeOrder: [],

  setSettings: (settings) => set({ settings }),

  clearFocus: () =>
    set((s) =>
      s.focusedNodeId === null ? s : { focusedNodeId: null },
    ),

  upsertNode: (n) =>
    set((s) => {
      const existing = s.nodes.findIndex((x) => x.id === n.id);
      if (existing === -1) return { nodes: [...s.nodes, n] };
      const copy = s.nodes.slice();
      copy[existing] = { ...copy[existing], ...n };
      return { nodes: copy };
    }),

  updateNodePosition: (id, x, y) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)),
    })),

  updateNodeSize: (id, width, height) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, width, height } : n)),
    })),

  toggleNodeExpandedSize: (id) =>
    set((s) => {
      const nodeIndex = s.nodes.findIndex((node) => node.id === id);
      if (nodeIndex === -1) return s;

      const node = s.nodes[nodeIndex];
      const expanded = getExpandedNodeSize(s.settings);
      const shouldCollapse = isNodeExpandedSize(node, s.settings);
      const nextWidth = shouldCollapse
        ? s.settings.defaultWidth
        : expanded.width;
      const nextHeight = shouldCollapse
        ? s.settings.defaultHeight
        : expanded.height;

      if (node.width === nextWidth && node.height === nextHeight) return s;

      const nodes = s.nodes.slice();
      nodes[nodeIndex] = {
        ...node,
        width: nextWidth,
        height: nextHeight,
      };
      return { nodes };
    }),

  resizeNode: (id, x, y, width, height) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, x, y, width, height } : n,
      ),
    })),

  removeNode: (id) =>
    set((s) => {
      const nodes = s.nodes.filter((n) => n.id !== id);
      const edges = s.edges.filter((e) => e.source !== id && e.target !== id);
      const valid = new Set(nodes.map((node) => node.id));

      let focusedNodeId =
        s.focusedNodeId && valid.has(s.focusedNodeId) ? s.focusedNodeId : null;
      let mruNodeOrder = pruneIds(s.mruNodeOrder, valid);

      if (!focusedNodeId) {
        focusedNodeId = mruNodeOrder[0] ?? nodes[0]?.id ?? null;
      }

      if (focusedNodeId) {
        mruNodeOrder = bumpMru(mruNodeOrder, focusedNodeId, valid);
      }

      return {
        nodes,
        edges,
        focusedNodeId,
        mruNodeOrder,
      };
    }),

  addEdge: (e) =>
    set((s) =>
      s.edges.some((x) => x.id === e.id) ? s : { edges: [...s.edges, e] },
    ),

  hydrate: (snapshot) => {
    if (!snapshot) return;
    set((s) => {
      const nodes = snapshot.nodes;
      const edges = snapshot.edges;
      const valid = new Set(nodes.map((node) => node.id));

      let focusedNodeId =
        s.focusedNodeId && valid.has(s.focusedNodeId) ? s.focusedNodeId : null;
      if (!focusedNodeId) {
        focusedNodeId = nodes[0]?.id ?? null;
      }

      let mruNodeOrder = pruneIds(s.mruNodeOrder, valid);

      if (focusedNodeId) {
        mruNodeOrder = bumpMru(mruNodeOrder, focusedNodeId, valid);
      }

      return {
        nodes,
        edges,
        focusedNodeId,
        mruNodeOrder,
      };
    });
  },

  snapshot: (camera) => ({
    nodes: get().nodes,
    edges: get().edges,
    camera,
  }),

  findById: (id) => get().nodes.find((n) => n.id === id),

  focusNode: (id, _options) =>
    set((s) => {
      const valid = new Set(s.nodes.map((node) => node.id));
      if (!valid.has(id)) return s;

      const mruNodeOrder = bumpMru(s.mruNodeOrder, id, valid);
      return {
        focusedNodeId: id,
        mruNodeOrder,
      };
    }),

  focusNextNode: () => {
    const state = get();
    const ordered = orderedNodeIds(state.nodes, state.mruNodeOrder);
    if (ordered.length === 0) return null;

    const currentIndex = state.focusedNodeId
      ? ordered.indexOf(state.focusedNodeId)
      : -1;
    const nextIndex =
      currentIndex === -1 ? 0 : (currentIndex + 1) % ordered.length;
    const nextId = ordered[nextIndex] ?? null;
    if (!nextId) return null;

    state.focusNode(nextId);
    return nextId;
  },

  focusPreviousNode: () => {
    const state = get();
    const ordered = orderedNodeIds(state.nodes, state.mruNodeOrder);
    if (ordered.length === 0) return null;

    const currentIndex = state.focusedNodeId
      ? ordered.indexOf(state.focusedNodeId)
      : -1;
    const prevIndex =
      currentIndex === -1
        ? 0
        : (currentIndex - 1 + ordered.length) % ordered.length;
    const prevId = ordered[prevIndex] ?? null;
    if (!prevId) return null;

    state.focusNode(prevId);
    return prevId;
  },
}));

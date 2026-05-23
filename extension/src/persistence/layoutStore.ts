import * as vscode from "vscode";
import type {
  CanvasEdge,
  CanvasNode,
  EditorBufferSnapshot,
  GraphSnapshot,
  RangeLike,
} from "../../../shared/protocol";

const ACTIVE_KEY = "wanderer.layout";
const SAVED_KEY = "wanderer.savedLayouts";
const DEFAULT_NODE_WIDTH = 520;
const DEFAULT_NODE_HEIGHT = 360;

type UnknownRecord = Record<string, unknown>;

export interface SavedLayout {
  name: string;
  snapshot: GraphSnapshot;
  savedAt: number; // epoch ms
  updatedAt: number; // epoch ms
  lastOpenedAt?: number; // epoch ms
  isPinned?: boolean;
  description?: string;
}

export class LayoutStore {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  // ---- Active (auto-save) layout ----

  load(): GraphSnapshot | null {
    const raw = this.context.workspaceState.get<unknown>(ACTIVE_KEY);
    return normalizeGraphSnapshot(raw);
  }

  save(snapshot: GraphSnapshot): void {
    void this.context.workspaceState.update(
      ACTIVE_KEY,
      normalizeGraphSnapshot(snapshot) ?? snapshot,
    );
  }

  // ---- Named saved layouts ----

  list(): SavedLayout[] {
    return sortLayouts(this.readNamedLayouts());
  }

  saveNamed(name: string, snapshot: GraphSnapshot): void {
    const normalizedSnapshot = normalizeGraphSnapshot(snapshot) ?? snapshot;
    const layouts = this.readNamedLayouts();
    const existing = layouts.findIndex((l) => l.name === name);
    const now = Date.now();
    if (existing !== -1) {
      layouts[existing] = {
        ...layouts[existing],
        name,
        snapshot: normalizedSnapshot,
        updatedAt: now,
      };
    } else {
      layouts.push({
        name,
        snapshot: normalizedSnapshot,
        savedAt: now,
        updatedAt: now,
        lastOpenedAt: now,
        isPinned: false,
      });
    }
    this.persistNamedLayouts(layouts);
  }

  get(name: string): SavedLayout | undefined {
    return this.list().find((l) => l.name === name);
  }

  rename(oldName: string, newName: string): boolean {
    const layouts = this.readNamedLayouts();
    const idx = layouts.findIndex((l) => l.name === oldName);
    if (idx === -1) return false;
    if (layouts.some((l) => l.name === newName)) return false;
    layouts[idx].name = newName;
    layouts[idx].updatedAt = Date.now();
    this.persistNamedLayouts(layouts);
    return true;
  }

  duplicate(sourceName: string, duplicateName: string): boolean {
    const layouts = this.readNamedLayouts();
    const source = layouts.find((l) => l.name === sourceName);
    if (!source) return false;
    if (layouts.some((l) => l.name === duplicateName)) return false;

    const now = Date.now();
    layouts.push({
      ...source,
      name: duplicateName,
      savedAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      isPinned: false,
    });
    this.persistNamedLayouts(layouts);
    return true;
  }

  togglePinned(name: string): boolean | undefined {
    const layouts = this.readNamedLayouts();
    const idx = layouts.findIndex((l) => l.name === name);
    if (idx === -1) return undefined;
    const nextPinned = !layouts[idx].isPinned;
    layouts[idx].isPinned = nextPinned;
    layouts[idx].updatedAt = Date.now();
    this.persistNamedLayouts(layouts);
    return nextPinned;
  }

  markOpened(name: string): boolean {
    const layouts = this.readNamedLayouts();
    const idx = layouts.findIndex((l) => l.name === name);
    if (idx === -1) return false;
    layouts[idx].lastOpenedAt = Date.now();
    this.persistNamedLayouts(layouts);
    return true;
  }

  deleteNamed(name: string): void {
    const layouts = this.readNamedLayouts().filter((l) => l.name !== name);
    this.persistNamedLayouts(layouts);
  }

  private readNamedLayouts(): SavedLayout[] {
    const raw = this.context.workspaceState.get<unknown>(SAVED_KEY);
    if (!Array.isArray(raw)) return [];

    const out: SavedLayout[] = [];
    for (const item of raw) {
      const normalized = normalizeLayout(item);
      if (!normalized) continue;
      out.push(normalized);
    }
    return out;
  }

  private persistNamedLayouts(layouts: SavedLayout[]): void {
    void this.context.workspaceState.update(SAVED_KEY, layouts);
    this._onDidChange.fire();
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}

function normalizeLayout(raw: unknown): SavedLayout | null {
  const obj = asRecord(raw);
  if (!obj) return null;

  if (typeof obj.name !== "string" || obj.name.trim().length === 0) {
    return null;
  }
  const snapshot = normalizeGraphSnapshot(obj.snapshot);
  if (!snapshot) {
    return null;
  }

  const savedAt =
    typeof obj.savedAt === "number" && Number.isFinite(obj.savedAt)
      ? obj.savedAt
      : Date.now();
  const updatedAt =
    typeof obj.updatedAt === "number" && Number.isFinite(obj.updatedAt)
      ? obj.updatedAt
      : savedAt;

  return {
    name: obj.name,
    snapshot,
    savedAt,
    updatedAt,
    lastOpenedAt:
      typeof obj.lastOpenedAt === "number" && Number.isFinite(obj.lastOpenedAt)
        ? obj.lastOpenedAt
        : undefined,
    isPinned: obj.isPinned === true,
    description:
      typeof obj.description === "string" && obj.description.trim().length > 0
        ? obj.description.trim()
        : undefined,
  };
}

function normalizeGraphSnapshot(raw: unknown): GraphSnapshot | null {
  const obj = asRecord(raw);
  if (!obj) return null;

  const hasGraphShape =
    Array.isArray(obj.nodes) ||
    Array.isArray(obj.edges) ||
    asRecord(obj.camera) !== null ||
    asRecord(obj.viewport) !== null;
  if (!hasGraphShape) return null;

  const nodeEntries = Array.isArray(obj.nodes) ? obj.nodes : [];
  const nodes: CanvasNode[] = [];
  const nodeIds = new Set<string>();
  const fileUriToNodeId = new Map<string, string>();

  for (const entry of nodeEntries) {
    const node = normalizeNode(entry);
    if (!node) continue;
    if (nodeIds.has(node.id)) continue;

    nodeIds.add(node.id);
    fileUriToNodeId.set(node.fileUri, node.id);
    nodes.push(node);
  }

  const edgeEntries = Array.isArray(obj.edges) ? obj.edges : [];
  const edges: CanvasEdge[] = [];
  const edgeIds = new Set<string>();

  for (const entry of edgeEntries) {
    const edge = normalizeEdge(entry, nodeIds, fileUriToNodeId, edgeIds);
    if (!edge) continue;
    edgeIds.add(edge.id);
    edges.push(edge);
  }

  const cameraSource = asRecord(obj.camera) ?? asRecord(obj.viewport);
  const camera = {
    x: asFiniteNumber(cameraSource?.x) ?? 0,
    y: asFiniteNumber(cameraSource?.y) ?? 0,
    zoom: normalizeZoom(asFiniteNumber(cameraSource?.zoom)),
  };

  const buffers = normalizeBuffers(obj.buffers);

  return {
    nodes,
    edges,
    camera,
    ...(buffers ? { buffers } : {}),
  };
}

function normalizeNode(raw: unknown): CanvasNode | null {
  const obj = asRecord(raw);
  if (!obj) return null;

  const fileUri = asString(obj.fileUri) ?? asString(obj.uri);
  if (!fileUri) return null;

  const id = asString(obj.id) ?? fileUri;
  const position = asRecord(obj.position);
  const style = asRecord(obj.style);
  const revealRange = normalizeRange(obj.revealRange);

  return {
    id,
    fileUri,
    x: asFiniteNumber(obj.x) ?? asFiniteNumber(position?.x) ?? 0,
    y: asFiniteNumber(obj.y) ?? asFiniteNumber(position?.y) ?? 0,
    width:
      asFiniteNumber(obj.width) ??
      asFiniteNumber(obj.w) ??
      asFiniteNumber(style?.width) ??
      DEFAULT_NODE_WIDTH,
    height:
      asFiniteNumber(obj.height) ??
      asFiniteNumber(obj.h) ??
      asFiniteNumber(style?.height) ??
      DEFAULT_NODE_HEIGHT,
    ...(revealRange ? { revealRange } : {}),
  };
}

function normalizeEdge(
  raw: unknown,
  nodeIds: Set<string>,
  fileUriToNodeId: Map<string, string>,
  usedEdgeIds: Set<string>,
): CanvasEdge | null {
  const obj = asRecord(raw);
  if (!obj) return null;

  let source =
    asString(obj.source) ??
    asString(obj.from) ??
    asString(obj.sourceNodeId) ??
    asString(obj.sourceUri);
  let target =
    asString(obj.target) ??
    asString(obj.to) ??
    asString(obj.targetNodeId) ??
    asString(obj.targetUri);

  source = resolveNodeRef(source, nodeIds, fileUriToNodeId);
  target = resolveNodeRef(target, nodeIds, fileUriToNodeId);

  if (!source || !target) return null;

  const type = normalizeEdgeType(obj.type ?? obj.kind);
  const baseId = asString(obj.id) ?? `${source}->${target}:${type}`;
  const id = ensureUniqueId(baseId, usedEdgeIds);

  return {
    id,
    source,
    target,
    type,
  };
}

function normalizeBuffers(
  raw: unknown,
): Record<string, EditorBufferSnapshot> | undefined {
  const obj = asRecord(raw);
  if (!obj) return undefined;

  const out: Record<string, EditorBufferSnapshot> = {};
  for (const [fileUri, value] of Object.entries(obj)) {
    const buffer = asRecord(value);
    if (!buffer) continue;

    const content = asString(buffer.content);
    const languageId = asString(buffer.languageId);
    const isDirty = buffer.isDirty;
    if (content === undefined || languageId === undefined) continue;
    if (typeof isDirty !== "boolean") continue;

    out[fileUri] = {
      content,
      languageId,
      isDirty,
    };
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeRange(raw: unknown): RangeLike | undefined {
  const obj = asRecord(raw);
  if (!obj) return undefined;

  const startLine = asFiniteNumber(obj.startLine);
  const startCharacter = asFiniteNumber(obj.startCharacter);
  const endLine = asFiniteNumber(obj.endLine);
  const endCharacter = asFiniteNumber(obj.endCharacter);

  if (
    startLine === undefined ||
    startCharacter === undefined ||
    endLine === undefined ||
    endCharacter === undefined
  ) {
    return undefined;
  }

  return {
    startLine,
    startCharacter,
    endLine,
    endCharacter,
  };
}

function normalizeEdgeType(raw: unknown): CanvasEdge["type"] {
  const value = asString(raw)?.toLowerCase();
  if (!value) return "manual";

  if (value === "definition" || value === "definitions") {
    return "definition";
  }
  if (
    value === "reference" ||
    value === "references" ||
    value === "usage" ||
    value === "usages"
  ) {
    return "reference";
  }
  if (
    value === "manual" ||
    value === "default" ||
    value === "edge" ||
    value === "link"
  ) {
    return "manual";
  }

  return "manual";
}

function resolveNodeRef(
  ref: string | undefined,
  nodeIds: Set<string>,
  fileUriToNodeId: Map<string, string>,
): string | undefined {
  if (!ref) return undefined;
  if (nodeIds.has(ref)) return ref;
  return fileUriToNodeId.get(ref);
}

function ensureUniqueId(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let counter = 2;
  let next = `${base}#${counter}`;
  while (used.has(next)) {
    counter += 1;
    next = `${base}#${counter}`;
  }
  return next;
}

function normalizeZoom(raw: number | undefined): number {
  if (raw === undefined) return 1;
  return raw > 0 ? raw : 1;
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" ? (value as UnknownRecord) : null;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function sortLayouts(layouts: SavedLayout[]): SavedLayout[] {
  return layouts.slice().sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }

    const openedDiff = (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0);
    if (openedDiff !== 0) return openedDiff;

    const updatedDiff = b.updatedAt - a.updatedAt;
    if (updatedDiff !== 0) return updatedDiff;

    const savedDiff = b.savedAt - a.savedAt;
    if (savedDiff !== 0) return savedDiff;

    return a.name.localeCompare(b.name);
  });
}

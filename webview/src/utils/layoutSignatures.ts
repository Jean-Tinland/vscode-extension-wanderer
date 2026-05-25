import type {
  CanvasEdge,
  CanvasNode,
  EditorBufferSnapshot,
} from "@shared/protocol";

export type LayoutBuffers = Record<string, EditorBufferSnapshot> | undefined;

export function buildGraphSignature(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): string {
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

export function buildCameraSignature(
  x: number,
  y: number,
  zoom: number,
): string {
  return `${round(x, 3)}|${round(y, 3)}|${round(zoom, 4)}`;
}

export function buildBufferSignature(buffers: LayoutBuffers): string {
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

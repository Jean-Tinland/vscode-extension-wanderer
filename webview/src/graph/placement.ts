import type { CanvasNode, CanvasSettings } from "@shared/protocol";

type RectLike = Pick<CanvasNode, "x" | "y" | "width" | "height">;

/**
 * Place a new node spatially adjacent to a source node, per the blueprint:
 *   newX = source.x + source.width + horizontalGap
 *   newY = source.y + stackIndex * (defaultHeight + verticalStack)
 */
export function placeAdjacent(
  source: CanvasNode | undefined,
  settings: CanvasSettings,
  stackIndex = 0,
): { x: number; y: number } {
  if (!source) return { x: 0, y: 0 };
  return {
    x: source.x + source.width + settings.horizontalGap,
    y:
      source.y + stackIndex * (settings.defaultHeight + settings.verticalStack),
  };
}

function intersects(a: RectLike, b: RectLike): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function findFirstAvailableVerticalSlot(
  preferred: { x: number; y: number },
  occupied: ReadonlyArray<RectLike>,
  settings: CanvasSettings,
): { x: number; y: number } {
  const stepY = settings.defaultHeight + settings.verticalStack;
  const candidate: RectLike = {
    x: preferred.x,
    y: preferred.y,
    width: settings.defaultWidth,
    height: settings.defaultHeight,
  };

  // Keep scanning down the stack column until we find a non-overlapping slot.
  const maxAttempts = Math.max(occupied.length * 3, 32);
  for (let attempt = 0; attempt <= maxAttempts; attempt += 1) {
    const hasOverlap = occupied.some((node) => intersects(candidate, node));
    if (!hasOverlap) {
      return { x: candidate.x, y: candidate.y };
    }
    candidate.y += stepY;
  }

  return { x: candidate.x, y: candidate.y };
}

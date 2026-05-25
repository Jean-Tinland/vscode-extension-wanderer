import classNames from "classnames";
import { useCallback, useRef } from "react";
import { useGraphStore } from "../state/graphStore";
import { useInteractionStore } from "../state/interactionStore";
import { useViewportStore } from "../state/viewportStore";
import { DOM_SELECTORS } from "../domHooks";
import styles from "../styles/canvas.module.css";

const MIN_WIDTH = 280;
const MIN_HEIGHT = 160;

type Dir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

interface Props {
  nodeId: string;
}

export function ResizeEdges({ nodeId }: Props) {
  const activeRef = useRef<{
    startClientX: number;
    startClientY: number;
    startWidth: number;
    startHeight: number;
    startNodeX: number;
    startNodeY: number;
    dir: Dir;
  } | null>(null);

  const begin = useCallback(
    (dir: Dir, e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const node = useGraphStore.getState().findById(nodeId);
      if (!node) return;

      const canvasRoot = e.currentTarget.closest(DOM_SELECTORS.canvas);

      activeRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startWidth: node.width,
        startHeight: node.height,
        startNodeX: node.x,
        startNodeY: node.y,
        dir,
      };

      const stopResize = () => {
        activeRef.current = null;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", stopResize);
        canvasRoot?.removeEventListener("mouseleave", stopResize);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      const onMove = (ev: MouseEvent) => {
        const a = activeRef.current;
        if (!a) return;

        const zoom = useViewportStore.getState().zoom;
        const dx = (ev.clientX - a.startClientX) / zoom;
        const dy = (ev.clientY - a.startClientY) / zoom;

        let x = a.startNodeX;
        let y = a.startNodeY;
        let w = a.startWidth;
        let h = a.startHeight;

        const hasE = a.dir.includes("e");
        const hasW = a.dir.includes("w");
        const hasN = a.dir.includes("n");
        const hasS = a.dir.includes("s");

        if (hasE) w = Math.max(MIN_WIDTH, a.startWidth + dx);
        if (hasW) {
          const nw = Math.max(MIN_WIDTH, a.startWidth - dx);
          x = a.startNodeX + (a.startWidth - nw);
          w = nw;
        }
        if (hasS) h = Math.max(MIN_HEIGHT, a.startHeight + dy);
        if (hasN) {
          const nh = Math.max(MIN_HEIGHT, a.startHeight - dy);
          y = a.startNodeY + (a.startHeight - nh);
          h = nh;
        }

        const { snapToGrid, gridSize } = useInteractionStore.getState();
        if (snapToGrid && Number.isFinite(gridSize) && gridSize > 1) {
          x = snapValue(x, gridSize);
          y = snapValue(y, gridSize);
          w = Math.max(MIN_WIDTH, snapValue(w, gridSize));
          h = Math.max(MIN_HEIGHT, snapValue(h, gridSize));
        }

        useGraphStore.getState().resizeNode(nodeId, x, y, w, h);
      };

      document.body.style.cursor = cursorFor(dir);
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", stopResize);
      canvasRoot?.addEventListener("mouseleave", stopResize);
    },
    [nodeId],
  );

  return (
    <>
      <div
        className={classNames(styles.resize, styles.resizeN)}
        onMouseDown={(e) => begin("n", e)}
      />
      <div
        className={classNames(styles.resize, styles.resizeS)}
        onMouseDown={(e) => begin("s", e)}
      />
      <div
        className={classNames(styles.resize, styles.resizeE)}
        onMouseDown={(e) => begin("e", e)}
      />
      <div
        className={classNames(styles.resize, styles.resizeW)}
        onMouseDown={(e) => begin("w", e)}
      />
      <div
        className={classNames(styles.resize, styles.resizeNw)}
        onMouseDown={(e) => begin("nw", e)}
      />
      <div
        className={classNames(styles.resize, styles.resizeNe)}
        onMouseDown={(e) => begin("ne", e)}
      />
      <div
        className={classNames(styles.resize, styles.resizeSw)}
        onMouseDown={(e) => begin("sw", e)}
      />
      <div
        className={classNames(styles.resize, styles.resizeSe)}
        onMouseDown={(e) => begin("se", e)}
      />
    </>
  );
}

function cursorFor(dir: Dir): string {
  switch (dir) {
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
    case "nw":
    case "se":
      return "nwse-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
  }
}

function snapValue(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

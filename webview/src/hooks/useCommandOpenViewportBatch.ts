import { useCallback, useEffect, useRef } from "react";
import { emitFitNodes, emitFocusNode } from "../navigation/events";

const DEFAULT_COMMAND_OPEN_VIEWPORT_BATCH_MS = 80;

interface CommandOpenViewportBatchState {
  nodeIds: string[];
  timer: number | null;
}

export function useCommandOpenViewportBatch(
  batchMs = DEFAULT_COMMAND_OPEN_VIEWPORT_BATCH_MS,
): (nodeId: string) => void {
  const batchRef = useRef<CommandOpenViewportBatchState>({
    nodeIds: [],
    timer: null,
  });

  const queueCommandOpenViewportUpdate = useCallback(
    (nodeId: string) => {
      const batch = batchRef.current;

      if (!batch.nodeIds.includes(nodeId)) {
        batch.nodeIds.push(nodeId);
      }

      if (batch.timer !== null) {
        window.clearTimeout(batch.timer);
      }

      batch.timer = window.setTimeout(() => {
        const queuedNodeIds = batch.nodeIds.slice();
        batch.nodeIds = [];
        batch.timer = null;

        if (queuedNodeIds.length === 0) return;

        if (queuedNodeIds.length === 1) {
          emitFocusNode({ nodeId: queuedNodeIds[0], recordHistory: false });
          return;
        }

        emitFitNodes({ nodeIds: queuedNodeIds, padding: 0.3, duration: 320 });
      }, batchMs);
    },
    [batchMs],
  );

  useEffect(() => {
    const batch = batchRef.current;
    return () => {
      if (batch.timer !== null) {
        window.clearTimeout(batch.timer);
      }
      batch.nodeIds = [];
      batch.timer = null;
    };
  }, []);

  return queueCommandOpenViewportUpdate;
}

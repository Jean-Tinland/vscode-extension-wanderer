import classNames from "classnames";
import { useMemo, useRef, useState } from "react";
import { useDialogFocusTrap } from "../hooks/useDialogFocusTrap";
import styles from "../styles/overlays.module.css";

interface NodeSwitchItem {
  id: string;
  fileUri: string;
}

interface NodeSwitcherProps {
  open: boolean;
  nodes: NodeSwitchItem[];
  onSelect: (nodeId: string) => void;
  onClose: () => void;
}

export function NodeSwitcher({
  open,
  nodes,
  onSelect,
  onClose,
}: NodeSwitcherProps) {
  if (!open) return null;

  return (
    <NodeSwitcherDialog nodes={nodes} onSelect={onSelect} onClose={onClose} />
  );
}

interface NodeSwitcherDialogProps {
  nodes: NodeSwitchItem[];
  onSelect: (nodeId: string) => void;
  onClose: () => void;
}

function NodeSwitcherDialog({ nodes, onSelect, onClose }: NodeSwitcherDialogProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useDialogFocusTrap(true, panelRef);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return nodes;
    return nodes.filter((node) => {
      const short = shortName(node.fileUri).toLowerCase();
      const full = node.fileUri.toLowerCase();
      return short.includes(q) || full.includes(q);
    });
  }, [nodes, query]);

  const clampedActiveIndex =
    filtered.length === 0
      ? 0
      : Math.min(Math.max(activeIndex, 0), filtered.length - 1);

  const selectActive = () => {
    const active = filtered[clampedActiveIndex];
    if (!active) return;
    onSelect(active.id);
  };

  const moveActive = (delta: number) => {
    setActiveIndex((index) => {
      if (filtered.length === 0) return 0;
      const start = Math.min(Math.max(index, 0), filtered.length - 1);
      return Math.min(Math.max(start + delta, 0), filtered.length - 1);
    });
  };

  return (
    <div
      className={styles.nodeSwitcher}
      role="dialog"
      aria-modal="true"
      aria-labelledby="node-switcher-title"
      data-node-switcher="true"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveActive(1);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          moveActive(-1);
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          selectActive();
        }
      }}
    >
      <div
        className={styles.nodeSwitcherBackdrop}
        aria-hidden="true"
        onClick={onClose}
      />
      <div className={styles.nodeSwitcherPanel} ref={panelRef} tabIndex={-1}>
        <header className={styles.nodeSwitcherHeader}>
          <h2 id="node-switcher-title">Switch node</h2>
          <button
            type="button"
            onClick={onClose}
            title="Close node switcher"
            aria-label="Close node switcher"
          >
            Close
          </button>
        </header>
        <div className={styles.nodeSwitcherBody}>
          <input
            autoFocus
            className={styles.nodeSwitcherInput}
            placeholder="Type file name or path"
            aria-label="Filter open nodes"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div
            className={styles.nodeSwitcherList}
            role="list"
            aria-label="Open nodes"
          >
            {filtered.length === 0 ? (
              <p className={styles.nodeSwitcherEmpty}>No matching nodes</p>
            ) : (
              filtered.map((node, idx) => {
                const active = idx === clampedActiveIndex;
                return (
                  <button
                    key={node.id}
                    type="button"
                    className={classNames(
                      styles.nodeSwitcherItem,
                      active && styles.nodeSwitcherItemActive,
                    )}
                    aria-current={active ? "true" : undefined}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => onSelect(node.id)}
                    title={node.fileUri}
                  >
                    <span className={styles.nodeSwitcherItemTitle}>
                      {shortName(node.fileUri)}
                    </span>
                    <span className={styles.nodeSwitcherItemPath}>
                      {node.fileUri}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function shortName(uri: string): string {
  try {
    const decoded = decodeURIComponent(uri);
    const parts = decoded
      .replace(/.*\/\//, "")
      .split("/")
      .filter(Boolean);
    return parts.slice(-2).join("/") || decoded;
  } catch {
    return uri;
  }
}

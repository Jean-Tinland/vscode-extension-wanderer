import { useEffect, useMemo, useRef, useState } from "react";
import { useDialogFocusTrap } from "../hooks/useDialogFocusTrap";

export interface NodeSwitchItem {
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
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useDialogFocusTrap(open, panelRef);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return nodes;
    return nodes.filter((node) => {
      const short = shortName(node.fileUri).toLowerCase();
      const full = node.fileUri.toLowerCase();
      return short.includes(q) || full.includes(q);
    });
  }, [nodes, query]);

  useEffect(() => {
    if (filtered.length === 0) {
      setActiveIndex(0);
      return;
    }
    setActiveIndex((idx) => Math.min(Math.max(idx, 0), filtered.length - 1));
  }, [filtered]);

  if (!open) return null;

  const selectActive = () => {
    const active = filtered[activeIndex];
    if (!active) return;
    onSelect(active.id);
  };

  return (
    <div
      className="cw-node-switcher"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cw-node-switcher-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setActiveIndex((idx) =>
            filtered.length === 0 ? 0 : Math.min(idx + 1, filtered.length - 1),
          );
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setActiveIndex((idx) => Math.max(idx - 1, 0));
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          selectActive();
        }
      }}
    >
      <div
        className="cw-node-switcher__backdrop"
        aria-hidden="true"
        onClick={onClose}
      />
      <div className="cw-node-switcher__panel" ref={panelRef} tabIndex={-1}>
        <header className="cw-node-switcher__header">
          <h2 id="cw-node-switcher-title">Switch node</h2>
          <button
            type="button"
            onClick={onClose}
            title="Close node switcher"
            aria-label="Close node switcher"
          >
            Close
          </button>
        </header>
        <div className="cw-node-switcher__body">
          <input
            autoFocus
            className="cw-node-switcher__input"
            placeholder="Type file name or path"
            aria-label="Filter open nodes"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div
            className="cw-node-switcher__list"
            role="list"
            aria-label="Open nodes"
          >
            {filtered.length === 0 ? (
              <p className="cw-node-switcher__empty">No matching nodes</p>
            ) : (
              filtered.map((node, idx) => {
                const active = idx === activeIndex;
                return (
                  <button
                    key={node.id}
                    type="button"
                    className={`cw-node-switcher__item${active ? " cw-node-switcher__item--active" : ""}`}
                    aria-current={active ? "true" : undefined}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => onSelect(node.id)}
                    title={node.fileUri}
                  >
                    <span className="cw-node-switcher__item-title">
                      {shortName(node.fileUri)}
                    </span>
                    <span className="cw-node-switcher__item-path">
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

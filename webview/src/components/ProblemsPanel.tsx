import { useRef } from "react";
import type { DiagnosticData } from "@shared/protocol";
import { useDialogFocusTrap } from "../hooks/useDialogFocusTrap";

export interface ProblemItem {
  id: string;
  nodeId: string;
  fileUri: string;
  marker: DiagnosticData;
}

interface ProblemsPanelProps {
  open: boolean;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  hintCount: number;
  items: ProblemItem[];
  onClose: () => void;
  onSelectProblem: (item: ProblemItem) => void;
}

export function ProblemsPanel({
  open,
  errorCount,
  warningCount,
  infoCount,
  hintCount,
  items,
  onClose,
  onSelectProblem,
}: ProblemsPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useDialogFocusTrap(open, panelRef);

  if (!open) return null;

  return (
    <div
      className="cw-problems"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cw-problems-title"
    >
      <div
        className="cw-problems__backdrop"
        aria-hidden="true"
        onClick={onClose}
      />
      <div className="cw-problems__panel" ref={panelRef} tabIndex={-1}>
        <header className="cw-problems__header">
          <h2 id="cw-problems-title">Problems in canvas</h2>
          <div className="cw-problems__summary">
            <span className="cw-problems__chip cw-problems__chip--error">
              Errors {errorCount}
            </span>
            <span className="cw-problems__chip cw-problems__chip--warning">
              Warnings {warningCount}
            </span>
            <span className="cw-problems__chip">Info {infoCount}</span>
            <span className="cw-problems__chip">Hints {hintCount}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close problems panel"
            aria-label="Close problems panel"
          >
            Close
          </button>
        </header>

        <div className="cw-problems__body">
          {items.length === 0 ? (
            <p className="cw-problems__empty">No diagnostics in open nodes.</p>
          ) : (
            <div className="cw-problems__list" role="list">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="cw-problems__item"
                  onClick={() => onSelectProblem(item)}
                  role="listitem"
                  title="Focus node"
                  aria-label={`Focus ${shortName(item.fileUri)} at line ${item.marker.startLine + 1}`}
                >
                  <span
                    className={`cw-problems__severity cw-problems__severity--${severityClass(item.marker.severity)}`}
                  >
                    {severityLabel(item.marker.severity)}
                  </span>
                  <span className="cw-problems__message">
                    {item.marker.message}
                  </span>
                  <span className="cw-problems__meta">
                    {shortName(item.fileUri)}:{item.marker.startLine + 1}:
                    {item.marker.startCharacter + 1}
                  </span>
                </button>
              ))}
            </div>
          )}
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

function severityClass(
  severity: number,
): "error" | "warning" | "info" | "hint" {
  if (severity >= 8) return "error";
  if (severity >= 4) return "warning";
  if (severity >= 2) return "info";
  return "hint";
}

function severityLabel(severity: number): string {
  switch (severityClass(severity)) {
    case "error":
      return "Error";
    case "warning":
      return "Warning";
    case "info":
      return "Info";
    case "hint":
      return "Hint";
  }
}

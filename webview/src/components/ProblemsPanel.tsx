import classNames from "classnames";
import { useRef } from "react";
import type { DiagnosticData } from "@shared/protocol";
import { useDialogFocusTrap } from "../hooks/useDialogFocusTrap";
import styles from "../styles/overlays.module.css";

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

const severityModifierClassName: Record<
  ReturnType<typeof severityClass>,
  string
> = {
  error: styles.problemsSeverityError,
  warning: styles.problemsSeverityWarning,
  info: styles.problemsSeverityInfo,
  hint: styles.problemsSeverityHint,
};

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
      className={styles.problems}
      role="dialog"
      aria-modal="true"
      aria-labelledby="problems-title"
      data-problems="true"
    >
      <div
        className={styles.problemsBackdrop}
        aria-hidden="true"
        onClick={onClose}
      />
      <div className={styles.problemsPanel} ref={panelRef} tabIndex={-1}>
        <header className={styles.problemsHeader}>
          <h2 id="problems-title">Problems in canvas</h2>
          <div className={styles.problemsSummary}>
            <span
              className={classNames(
                styles.problemsChip,
                styles.problemsChipError,
              )}
            >
              Errors {errorCount}
            </span>
            <span
              className={classNames(
                styles.problemsChip,
                styles.problemsChipWarning,
              )}
            >
              Warnings {warningCount}
            </span>
            <span className={styles.problemsChip}>Info {infoCount}</span>
            <span className={styles.problemsChip}>Hints {hintCount}</span>
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

        <div className={styles.problemsBody}>
          {items.length === 0 ? (
            <p className={styles.problemsEmpty}>
              No diagnostics in open nodes.
            </p>
          ) : (
            <div className={styles.problemsList} role="list">
              {items.map((item) => {
                const severity = severityClass(item.marker.severity);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={styles.problemsItem}
                    onClick={() => onSelectProblem(item)}
                    role="listitem"
                    title="Focus node"
                    aria-label={`Focus ${shortName(item.fileUri)} at line ${item.marker.startLine + 1}`}
                  >
                    <span
                      className={classNames(
                        styles.problemsSeverity,
                        severityModifierClassName[severity],
                      )}
                    >
                      {severityLabel(item.marker.severity)}
                    </span>
                    <span className={styles.problemsMessage}>
                      {item.marker.message}
                    </span>
                    <span className={styles.problemsMeta}>
                      {shortName(item.fileUri)}:{item.marker.startLine + 1}:
                      {item.marker.startCharacter + 1}
                    </span>
                  </button>
                );
              })}
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

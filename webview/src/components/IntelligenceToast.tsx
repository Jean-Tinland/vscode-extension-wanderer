import type { IntelligenceTimeoutNotice } from "../state/intelligenceStore";
import styles from "../styles/overlays.module.css";

interface IntelligenceToastProps {
  notice: IntelligenceTimeoutNotice | null;
  onRetry: () => void;
  onDismiss: () => void;
}

export function IntelligenceToast({
  notice,
  onRetry,
  onDismiss,
}: IntelligenceToastProps) {
  if (!notice) return null;

  return (
    <div className={styles.intelToast} role="status" aria-live="polite">
      <div className={styles.intelToastText}>
        <strong>Language service:</strong> {notice.message}
      </div>
      <div className={styles.intelToastActions}>
        {notice.canRetry ? (
          <button
            type="button"
            onClick={onRetry}
            title="Retry last request"
            aria-label="Retry language service request"
          >
            Retry
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDismiss}
          title="Dismiss message"
          aria-label="Dismiss language service message"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

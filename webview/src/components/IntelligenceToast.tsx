import type { IntelligenceTimeoutNotice } from "../state/intelligenceStore";

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
    <div className="cw-intel-toast" role="status" aria-live="polite">
      <div className="cw-intel-toast__text">
        <strong>Language service:</strong> {notice.message}
      </div>
      <div className="cw-intel-toast__actions">
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

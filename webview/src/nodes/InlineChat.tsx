import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  newRequestId,
  onExtensionMessage,
  postToExtension,
} from "../bridge/vscode";
import { Icon } from "../components/Icon";

interface InlineChatProps {
  fileUri: string;
  languageId: string;
  /** Pixel offset from the top of the editor container where the cursor is. */
  cursorTop: number | null;
  getSelectedText: () => string;
  getFullText: () => string;
  getCursorPosition: () => { line: number; character: number };
  applyText: (text: string, hasSelection: boolean) => void;
  onClose: () => void;
}

export const InlineChat = memo(function InlineChat({
  fileUri,
  languageId,
  cursorTop,
  getSelectedText,
  getFullText,
  getCursorPosition,
  applyText,
  onClose,
}: InlineChatProps) {
  const [prompt, setPrompt] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeRequestRef = useRef<string | null>(null);
  const hadSelectionRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const cancelActiveRequest = useCallback(() => {
    if (activeRequestRef.current) {
      postToExtension({
        type: "cancelRequest",
        requestId: activeRequestRef.current,
      });
      activeRequestRef.current = null;
    }
  }, []);

  const handleSubmit = useCallback(() => {
    if (!prompt.trim() || streaming) return;

    const selectedText = getSelectedText();
    const fullText = getFullText();
    const pos = getCursorPosition();
    const requestId = newRequestId();
    hadSelectionRef.current = selectedText.length > 0;

    cancelActiveRequest();
    activeRequestRef.current = requestId;
    setStreaming(true);
    setError(null);
    setPreview("");

    const unsub = onExtensionMessage((msg) => {
      if (msg.type === "inlineChatChunk" && msg.requestId === requestId) {
        setPreview((prev) => prev + msg.text);
      } else if (
        msg.type === "inlineChatResult" &&
        msg.requestId === requestId
      ) {
        unsub();
        activeRequestRef.current = null;
        setStreaming(false);
        applyText(msg.text, hadSelectionRef.current);
        onClose();
      } else if (
        msg.type === "inlineChatError" &&
        msg.requestId === requestId
      ) {
        unsub();
        activeRequestRef.current = null;
        setStreaming(false);
        setError(msg.message);
      }
    });

    postToExtension({
      type: "requestInlineChat",
      requestId,
      fileUri,
      prompt: prompt.trim(),
      selectedText,
      fullText,
      line: pos.line,
      character: pos.character,
      languageId,
    });
  }, [
    prompt,
    streaming,
    fileUri,
    languageId,
    getSelectedText,
    getFullText,
    getCursorPosition,
    applyText,
    onClose,
    cancelActiveRequest,
  ]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelActiveRequest();
        onClose();
      }
    },
    [handleSubmit, onClose, cancelActiveRequest],
  );

  useEffect(() => {
    return () => {
      cancelActiveRequest();
    };
  }, [cancelActiveRequest]);

  const positionStyle: React.CSSProperties =
    cursorTop != null ? { top: cursorTop, bottom: "auto" } : {};

  return (
    <div
      className="cw-inline-chat"
      style={positionStyle}
      onMouseDown={(e) => e.stopPropagation()}
      role="region"
      aria-label="Inline Copilot chat"
    >
      <div className="cw-inline-chat__header">
        <Icon code="sparkle" width={14} height={14} aria-hidden="true" />
        <span className="cw-inline-chat__label">Copilot</span>
        {streaming && (
          <span
            className="cw-inline-chat__spinner"
            role="status"
            aria-live="polite"
            aria-label="Generating"
          />
        )}
        <button
          type="button"
          className="cw-inline-chat__close"
          onClick={() => {
            cancelActiveRequest();
            onClose();
          }}
          title="Close (Escape)"
          aria-label="Close"
        >
          <Icon code="close" width={12} height={12} aria-hidden="true" />
        </button>
      </div>
      <div className="cw-inline-chat__body">
        <textarea
          ref={inputRef}
          className="cw-inline-chat__input"
          placeholder="Ask Copilot to edit…"
          aria-label="Inline chat prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={streaming}
        />
        <button
          type="button"
          className="cw-inline-chat__submit"
          onClick={handleSubmit}
          disabled={!prompt.trim() || streaming}
          title="Submit (Enter)"
          aria-label="Submit"
        >
          <Icon code="send" width={14} height={14} aria-hidden="true" />
        </button>
      </div>
      {preview && <pre className="cw-inline-chat__preview">{preview}</pre>}
      {error && <div className="cw-inline-chat__error">{error}</div>}
    </div>
  );
});

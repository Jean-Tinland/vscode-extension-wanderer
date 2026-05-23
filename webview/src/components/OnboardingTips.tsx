import { useEffect, useMemo, useRef } from "react";
import type { ShortcutHint } from "../keyboard/shortcuts";
import { useDialogFocusTrap } from "../hooks/useDialogFocusTrap";

interface OnboardingTipsProps {
  open: boolean;
  shortcuts: ShortcutHint[];
  onClose: () => void;
  onDismissForever: () => void;
}

const ONBOARDING_TITLE_ID = "cw-onboarding-title";
const ONBOARDING_DESC_ID = "cw-onboarding-desc";

export function OnboardingTips({
  open,
  shortcuts,
  onClose,
  onDismissForever,
}: OnboardingTipsProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  const shortcutById = useMemo(
    () => new Map(shortcuts.map((shortcut) => [shortcut.id, shortcut.keys])),
    [shortcuts],
  );

  useDialogFocusTrap(open, panelRef);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="cw-onboarding"
      role="dialog"
      aria-modal="true"
      aria-labelledby={ONBOARDING_TITLE_ID}
      aria-describedby={ONBOARDING_DESC_ID}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        onClose();
      }}
    >
      <div
        className="cw-onboarding__backdrop"
        aria-hidden="true"
        onClick={onClose}
      />
      <div className="cw-onboarding__panel" ref={panelRef} tabIndex={-1}>
        <header className="cw-onboarding__header">
          <h2 id={ONBOARDING_TITLE_ID}>Welcome to Wanderer</h2>
          <button
            type="button"
            className="cw-onboarding__close"
            onClick={onClose}
            aria-label="Close onboarding tips"
            title="Close"
          >
            Close
          </button>
        </header>

        <p id={ONBOARDING_DESC_ID} className="cw-onboarding__subtitle">
          Start with these quick tips to navigate large graphs comfortably.
        </p>

        <ul className="cw-onboarding__list">
          <li className="cw-onboarding__item">
            <span>Open files directly on canvas:</span>
            <kbd className="cw-onboarding__key">
              {shortcutById.get("openFile") ?? "Cmd/Ctrl+Alt+O"}
            </kbd>
          </li>
          <li className="cw-onboarding__item">
            <span>Jump between open nodes:</span>
            <kbd className="cw-onboarding__key">
              {shortcutById.get("openNodeSwitcher") ?? "Cmd+Ctrl+K / Ctrl+Alt+K"}
            </kbd>
          </li>
          <li className="cw-onboarding__item">
            <span>
              Cmd/Ctrl-click in an editor to follow definitions or open project
              usages.
            </span>
          </li>
          <li className="cw-onboarding__item">
            <span>Toggle the problems panel when diagnostics pile up:</span>
            <kbd className="cw-onboarding__key">
              {shortcutById.get("toggleProblemsPanel") ?? "Cmd/Ctrl+Alt+M"}
            </kbd>
          </li>
          <li className="cw-onboarding__item">
            <span>Open the keyboard cheatsheet anytime:</span>
            <kbd className="cw-onboarding__key">
              {shortcutById.get("toggleShortcutHelp") ?? "Cmd/Ctrl+Alt+/"}
            </kbd>
          </li>
        </ul>

        <footer className="cw-onboarding__footer">
          <button
            type="button"
            className="cw-onboarding__button cw-onboarding__button--primary"
            onClick={onClose}
            autoFocus
          >
            Start exploring
          </button>
          <button
            type="button"
            className="cw-onboarding__button"
            onClick={onDismissForever}
          >
            Do not show again
          </button>
        </footer>
      </div>
    </div>
  );
}

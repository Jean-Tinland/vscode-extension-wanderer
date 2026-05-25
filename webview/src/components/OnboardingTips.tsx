import classNames from "classnames";
import { useEffect, useMemo, useRef } from "react";
import type { ShortcutHint } from "../keyboard/shortcuts";
import { useDialogFocusTrap } from "../hooks/useDialogFocusTrap";
import styles from "../styles/overlays.module.css";

interface OnboardingTipsProps {
  open: boolean;
  shortcuts: ShortcutHint[];
  onClose: () => void;
  onDismissForever: () => void;
}

const ONBOARDING_TITLE_ID = "onboarding-title";
const ONBOARDING_DESC_ID = "onboarding-desc";

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
      className={styles.onboarding}
      role="dialog"
      aria-modal="true"
      aria-labelledby={ONBOARDING_TITLE_ID}
      aria-describedby={ONBOARDING_DESC_ID}
      data-onboarding="true"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        onClose();
      }}
    >
      <div
        className={styles.onboardingBackdrop}
        aria-hidden="true"
        onClick={onClose}
      />
      <div className={styles.onboardingPanel} ref={panelRef} tabIndex={-1}>
        <header className={styles.onboardingHeader}>
          <h2 id={ONBOARDING_TITLE_ID}>Welcome to Wanderer</h2>
          <button
            type="button"
            className={styles.onboardingClose}
            onClick={onClose}
            aria-label="Close onboarding tips"
            title="Close"
          >
            Close
          </button>
        </header>

        <p id={ONBOARDING_DESC_ID} className={styles.onboardingSubtitle}>
          Start with these quick tips to navigate large graphs comfortably.
        </p>

        <ul className={styles.onboardingList}>
          <li className={styles.onboardingItem}>
            <span>Open files directly on canvas:</span>
            <kbd className={styles.onboardingKey}>
              {shortcutById.get("openFile") ?? "Cmd/Ctrl+Alt+O"}
            </kbd>
          </li>
          <li className={styles.onboardingItem}>
            <span>Jump between open nodes:</span>
            <kbd className={styles.onboardingKey}>
              {shortcutById.get("openNodeSwitcher") ??
                "Cmd+Ctrl+K / Ctrl+Alt+K"}
            </kbd>
          </li>
          <li className={styles.onboardingItem}>
            <span>
              Cmd/Ctrl-click in an editor to follow definitions or open project
              usages.
            </span>
          </li>
          <li className={styles.onboardingItem}>
            <span>Toggle the problems panel when diagnostics pile up:</span>
            <kbd className={styles.onboardingKey}>
              {shortcutById.get("toggleProblemsPanel") ?? "Cmd/Ctrl+Alt+M"}
            </kbd>
          </li>
          <li className={styles.onboardingItem}>
            <span>Open the keyboard cheatsheet anytime:</span>
            <kbd className={styles.onboardingKey}>
              {shortcutById.get("toggleShortcutHelp") ?? "Cmd/Ctrl+Alt+/"}
            </kbd>
          </li>
        </ul>

        <footer className={styles.onboardingFooter}>
          <button
            type="button"
            className={classNames(
              styles.onboardingButton,
              styles.onboardingButtonPrimary,
            )}
            onClick={onClose}
            autoFocus
          >
            Start exploring
          </button>
          <button
            type="button"
            className={styles.onboardingButton}
            onClick={onDismissForever}
          >
            Do not show again
          </button>
        </footer>
      </div>
    </div>
  );
}

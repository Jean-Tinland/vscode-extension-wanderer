import { useEffect, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

export function useDialogFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!active) return;

    const container = containerRef.current;
    if (!container) return;

    const previousActive =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const currentActive =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    if (!currentActive || !container.contains(currentActive)) {
      const focusable = getFocusableElements(container);
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        container.focus();
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;

      const focusable = getFocusableElements(container);
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;

      if (event.shiftKey) {
        if (
          !activeElement ||
          activeElement === first ||
          !container.contains(activeElement)
        ) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (
        !activeElement ||
        activeElement === last ||
        !container.contains(activeElement)
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      if (previousActive && document.contains(previousActive)) {
        previousActive.focus();
      }
    };
  }, [active, containerRef]);
}

import {
  type FocusEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type TooltipPlacement = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  label: string;
  placement?: TooltipPlacement;
  children: ReactNode;
}

interface TooltipPosition {
  top: number;
  left: number;
  placement: TooltipPlacement;
}

const TOOLTIP_GAP = 10;
const VIEWPORT_PADDING = 8;

function clampToViewport(
  value: number,
  size: number,
  viewport: number,
): number {
  const min = VIEWPORT_PADDING;
  const max = Math.max(min, viewport - size - VIEWPORT_PADDING);
  return Math.min(Math.max(value, min), max);
}

function resolvePlacement(
  preferred: TooltipPlacement,
  triggerRect: DOMRect,
  tooltipRect: DOMRect,
): TooltipPlacement {
  const availableTop = triggerRect.top - VIEWPORT_PADDING;
  const availableBottom =
    window.innerHeight - triggerRect.bottom - VIEWPORT_PADDING;
  const availableLeft = triggerRect.left - VIEWPORT_PADDING;
  const availableRight =
    window.innerWidth - triggerRect.right - VIEWPORT_PADDING;

  const fitsTop = availableTop >= tooltipRect.height + TOOLTIP_GAP;
  const fitsBottom = availableBottom >= tooltipRect.height + TOOLTIP_GAP;
  const fitsLeft = availableLeft >= tooltipRect.width + TOOLTIP_GAP;
  const fitsRight = availableRight >= tooltipRect.width + TOOLTIP_GAP;

  switch (preferred) {
    case "top":
      if (fitsTop) return "top";
      if (fitsBottom) return "bottom";
      return availableTop > availableBottom ? "top" : "bottom";
    case "bottom":
      if (fitsBottom) return "bottom";
      if (fitsTop) return "top";
      return availableBottom > availableTop ? "bottom" : "top";
    case "left":
      if (fitsLeft) return "left";
      if (fitsRight) return "right";
      return availableLeft > availableRight ? "left" : "right";
    case "right":
      if (fitsRight) return "right";
      if (fitsLeft) return "left";
      return availableRight > availableLeft ? "right" : "left";
    default:
      return preferred;
  }
}

function computeCoordinates(
  triggerRect: DOMRect,
  tooltipRect: DOMRect,
  placement: TooltipPlacement,
): { top: number; left: number } {
  switch (placement) {
    case "top":
      return {
        top: triggerRect.top - tooltipRect.height - TOOLTIP_GAP,
        left: triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2,
      };
    case "left":
      return {
        top: triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2,
        left: triggerRect.left - tooltipRect.width - TOOLTIP_GAP,
      };
    case "right":
      return {
        top: triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2,
        left: triggerRect.right + TOOLTIP_GAP,
      };
    case "bottom":
    default:
      return {
        top: triggerRect.bottom + TOOLTIP_GAP,
        left: triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2,
      };
  }
}

export function Tooltip({
  label,
  placement = "bottom",
  children,
}: TooltipProps) {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<TooltipPosition>({
    top: -9999,
    left: -9999,
    placement,
  });
  const hasLabel = label.trim().length > 0;
  const tooltipId = useId();

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const tooltip = tooltipRef.current;
    if (!anchor || !tooltip) return;

    const triggerRect = anchor.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const nextPlacement = resolvePlacement(placement, triggerRect, tooltipRect);
    const nextCoordinates = computeCoordinates(
      triggerRect,
      tooltipRect,
      nextPlacement,
    );

    const nextLeft = clampToViewport(
      nextCoordinates.left,
      tooltipRect.width,
      window.innerWidth,
    );
    const nextTop = clampToViewport(
      nextCoordinates.top,
      tooltipRect.height,
      window.innerHeight,
    );

    setPosition((current) => {
      if (
        current.top === nextTop &&
        current.left === nextLeft &&
        current.placement === nextPlacement
      ) {
        return current;
      }
      return {
        top: nextTop,
        left: nextLeft,
        placement: nextPlacement,
      };
    });
  }, [placement]);

  useLayoutEffect(() => {
    if (!visible || !hasLabel) return;
    updatePosition();
  }, [hasLabel, label, updatePosition, visible]);

  useEffect(() => {
    if (!visible || !hasLabel) return;

    const handleReposition = () => {
      updatePosition();
    };

    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [hasLabel, updatePosition, visible]);

  useEffect(() => {
    if (!visible || !hasLabel) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setVisible(false);
      }
    };

    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [hasLabel, visible]);

  const show = useCallback(() => {
    if (!hasLabel) return;
    setVisible(true);
  }, [hasLabel]);

  const hide = useCallback(() => {
    setVisible(false);
  }, []);

  const onFocusCapture = useCallback(
    (event: FocusEvent<HTMLSpanElement>) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        show();
        return;
      }
      if (target.matches(":focus-visible")) {
        show();
      }
    },
    [show],
  );

  const onBlurCapture = useCallback(
    (event: FocusEvent<HTMLSpanElement>) => {
      const next = event.relatedTarget;
      if (next instanceof Node && event.currentTarget.contains(next)) {
        return;
      }
      hide();
    },
    [hide],
  );

  if (!hasLabel) {
    return <>{children}</>;
  }

  return (
    <span
      className="cw-tooltip-anchor"
      ref={anchorRef}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={onFocusCapture}
      onBlurCapture={onBlurCapture}
      aria-describedby={visible ? tooltipId : undefined}
    >
      {children}
      {visible
        ? createPortal(
            <div
              id={tooltipId}
              className="cw-tooltip"
              data-placement={position.placement}
              ref={tooltipRef}
              role="tooltip"
              style={{ top: position.top, left: position.left }}
            >
              {label}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}

import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactElement } from "react";

type TooltipPlacement = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  label: string;
  placement?: TooltipPlacement;
  children: ReactElement;
}

export function Tooltip({
  label,
  placement = "bottom",
  children,
}: TooltipProps) {
  const text = label.trim();

  if (text.length === 0) {
    return children;
  }

  return (
    <BaseTooltip.Provider delay={240} closeDelay={0}>
      <BaseTooltip.Root>
        <BaseTooltip.Trigger render={children} />
        <BaseTooltip.Portal>
          <BaseTooltip.Positioner side={placement} sideOffset={8}>
            <BaseTooltip.Popup className="cw-tooltip">{text}</BaseTooltip.Popup>
          </BaseTooltip.Positioner>
        </BaseTooltip.Portal>
      </BaseTooltip.Root>
    </BaseTooltip.Provider>
  );
}

import { Menu } from "@base-ui/react/menu";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

export interface BaseMenuOption<Value extends string> {
  value: Value;
  label: ReactNode;
  meta?: ReactNode;
  disabled?: boolean;
}

interface BaseMenuProps<Value extends string> {
  label: ReactNode;
  ariaLabel: string;
  triggerValue: ReactNode;
  options: BaseMenuOption<Value>[];
  onSelect: (value: Value) => void;
  emptyStateLabel?: ReactNode;
  title?: string;
  disabled?: boolean;
}

export function BaseMenu<Value extends string>({
  label,
  ariaLabel,
  triggerValue,
  options,
  onSelect,
  emptyStateLabel = "No options available.",
  title,
  disabled,
}: BaseMenuProps<Value>) {
  return (
    <Menu.Root>
      <Menu.Trigger
        className="cw-ui-button cw-ui-menu-trigger"
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
      >
        <span className="cw-ui-menu-trigger__label">{label}</span>
        <span className="cw-ui-menu-trigger__value">{triggerValue}</span>
        <span className="cw-ui-menu-trigger__caret" aria-hidden="true">
          <Icon code="chevron-down" size={12} aria-hidden="true" />
        </span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="start">
          <Menu.Popup className="cw-ui-menu-popup" aria-label={ariaLabel}>
            {options.length > 0 ? (
              options.map((option) => (
                <Menu.Item
                  key={option.value}
                  className="cw-ui-menu-item"
                  disabled={option.disabled}
                  onClick={() => onSelect(option.value)}
                >
                  <span className="cw-ui-menu-item__label">{option.label}</span>
                  {option.meta ? (
                    <span className="cw-ui-menu-item__meta">{option.meta}</span>
                  ) : null}
                </Menu.Item>
              ))
            ) : (
              <div className="cw-ui-menu-empty">{emptyStateLabel}</div>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

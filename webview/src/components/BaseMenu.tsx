import { Menu } from "@base-ui/react/menu";
import classNames from "classnames";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import styles from "../styles/design-system.module.css";

export interface BaseMenuOption<Value extends string> {
  value: Value;
  label: ReactNode;
  meta?: ReactNode;
  disabled?: boolean;
}

interface BaseMenuProps<Value extends string> {
  label: ReactNode;
  ariaLabel: string;
  options: BaseMenuOption<Value>[];
  onSelect: (value: Value) => void;
  emptyStateLabel?: ReactNode;
  title?: string;
  disabled?: boolean;
}

export function BaseMenu<Value extends string>({
  label,
  ariaLabel,
  options,
  onSelect,
  emptyStateLabel = "No options available.",
  title,
  disabled,
}: BaseMenuProps<Value>) {
  return (
    <Menu.Root>
      <Menu.Trigger
        className={classNames(styles.uiButton, styles.uiMenuTrigger)}
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
      >
        <span className={styles.uiMenuTriggerLabel}>{label}</span>
        <span className={styles.uiMenuTriggerCaret} aria-hidden="true">
          <Icon code="chevron-down" size={12} aria-hidden="true" />
        </span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="start">
          <Menu.Popup className={styles.uiMenuPopup} aria-label={ariaLabel}>
            {options.length > 0 ? (
              options.map((option) => (
                <Menu.Item
                  key={option.value}
                  className={styles.uiMenuItem}
                  disabled={option.disabled}
                  onClick={() => onSelect(option.value)}
                >
                  <span className={styles.uiMenuItemLabel}>
                    {option.label}
                  </span>
                  {option.meta ? (
                    <span className={styles.uiMenuItemMeta}>
                      {option.meta}
                    </span>
                  ) : null}
                </Menu.Item>
              ))
            ) : (
              <div className={styles.uiMenuEmpty}>{emptyStateLabel}</div>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

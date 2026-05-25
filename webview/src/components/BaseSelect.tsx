import { Select } from "@base-ui/react/select";
import classNames from "classnames";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import designStyles from "../styles/design-system.module.css";
import toolbarStyles from "../styles/toolbar.module.css";

const styles: Record<string, string> = {
  ...designStyles,
  ...toolbarStyles,
};

export interface BaseSelectOption<Value extends string> {
  value: Value;
  label: ReactNode;
  meta?: ReactNode;
  disabled?: boolean;
}

interface BaseSelectProps<Value extends string> {
  label: ReactNode;
  ariaLabel: string;
  value: Value | null;
  options: BaseSelectOption<Value>[];
  placeholder: ReactNode;
  onValueChange: (value: Value) => void;
  selectedIndicator?: ReactNode;
  title?: string;
  disabled?: boolean;
}

export function BaseSelect<Value extends string>({
  label,
  ariaLabel,
  value,
  options,
  placeholder,
  onValueChange,
  selectedIndicator,
  title,
  disabled,
}: BaseSelectProps<Value>) {
  return (
    <Select.Root<Value>
      value={value}
      items={options.map((option) => ({
        value: option.value,
        label: option.label,
      }))}
      onValueChange={(nextValue) => {
        if (nextValue !== null) {
          onValueChange(nextValue);
        }
      }}
    >
      <Select.Trigger
        className={classNames(styles.uiButton, styles.toolbarSelectTrigger)}
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
      >
        <span className={styles.toolbarSelectLabel}>{label}</span>
        <span className={styles.toolbarSelectValue}>
          <Select.Value placeholder={placeholder} />
        </span>
        <Select.Icon className={styles.toolbarSelectCaret} aria-hidden="true">
          <Icon code="chevron-down" size={12} aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Positioner sideOffset={8} align="start">
          <Select.Popup
            className={styles.uiSelectPopup}
            aria-label={ariaLabel}
          >
            <Select.List className={styles.uiSelectList}>
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={styles.uiSelectItem}
                >
                  <span className={styles.uiSelectItemContent}>
                    <Select.ItemText className={styles.uiSelectItemLabel}>
                      {option.label}
                    </Select.ItemText>
                    {option.meta ? (
                      <span className={styles.uiSelectItemMeta}>
                        {option.meta}
                      </span>
                    ) : null}
                  </span>
                  {selectedIndicator ? (
                    <Select.ItemIndicator
                      className={styles.uiSelectItemIndicator}
                      aria-hidden="true"
                    >
                      {selectedIndicator}
                    </Select.ItemIndicator>
                  ) : null}
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

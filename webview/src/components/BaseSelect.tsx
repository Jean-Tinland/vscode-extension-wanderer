import { Select } from "@base-ui/react/select";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

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
        className="cw-ui-button cw-toolbar__select-trigger"
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
      >
        <span className="cw-toolbar__select-label">{label}</span>
        <span className="cw-toolbar__select-value">
          <Select.Value placeholder={placeholder} />
        </span>
        <Select.Icon className="cw-toolbar__select-caret" aria-hidden="true">
          <Icon code="chevron-down" size={12} aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Positioner sideOffset={8} align="start">
          <Select.Popup className="cw-ui-select-popup" aria-label={ariaLabel}>
            <Select.List className="cw-ui-select-list">
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className="cw-ui-select-item"
                >
                  <span className="cw-ui-select-item__content">
                    <Select.ItemText className="cw-ui-select-item__label">
                      {option.label}
                    </Select.ItemText>
                    {option.meta ? (
                      <span className="cw-ui-select-item__meta">
                        {option.meta}
                      </span>
                    ) : null}
                  </span>
                  {selectedIndicator ? (
                    <Select.ItemIndicator
                      className="cw-ui-select-item__indicator"
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

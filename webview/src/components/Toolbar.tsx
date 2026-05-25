import classNames from "classnames";
import { type ComponentPropsWithoutRef, type ReactNode, useRef } from "react";
import type { SavedLayoutSummary } from "@shared/protocol";
import type { ShortcutHint } from "../keyboard/shortcuts";
import { useDialogFocusTrap } from "../hooks/useDialogFocusTrap";
import type { ReferenceClickMode } from "../state/interactionStore";
import { BaseMenu, type BaseMenuOption } from "./BaseMenu";
import { BaseSelect, type BaseSelectOption } from "./BaseSelect";
import { Icon } from "./Icon";
import { Tooltip } from "./Tooltip";
import designStyles from "../styles/design-system.module.css";
import toolbarStyles from "../styles/toolbar.module.css";

const styles: Record<string, string> = {
  ...designStyles,
  ...toolbarStyles,
};

interface ToolbarProps {
  nodeCount: number;
  problemCount: number;
  errorCount: number;
  warningCount: number;
  zoom: number;
  snapToGrid: boolean;
  referenceClickMode: ReferenceClickMode;
  savedLayouts: SavedLayoutSummary[];
  showShortcuts: boolean;
  showProblems: boolean;
  showOnboarding: boolean;
  shortcuts: ShortcutHint[];
  onOpenFile: () => void;
  onOpenManyFiles: () => void;
  onOpenNodeSwitcher: () => void;
  onSaveLayout: () => void;
  onLoadLayout: (name: string) => void;
  onNextNode: () => void;
  onPreviousNode: () => void;
  onZoomToFit: () => void;
  onToggleSnapToGrid: () => void;
  onReferenceClickModeChange: (mode: ReferenceClickMode) => void;
  onToggleProblems: () => void;
  onToggleShortcuts: () => void;
  onToggleOnboarding: () => void;
  onCloseShortcuts: () => void;
  canCycleNodes: boolean;
}

interface ToolbarIconButtonProps extends ComponentPropsWithoutRef<"button"> {
  tooltip: string;
  children: ReactNode;
}

function ToolbarIconButton({
  tooltip,
  type = "button",
  children,
  ...buttonProps
}: ToolbarIconButtonProps) {
  const className = classNames(
    styles.uiButton,
    styles.uiIconButton,
    buttonProps.className,
  );

  return (
    <Tooltip label={tooltip}>
      <button type={type} {...buttonProps} className={className}>
        {children}
      </button>
    </Tooltip>
  );
}

const REFERENCE_MODE_OPTIONS: BaseSelectOption<ReferenceClickMode>[] = [
  { value: "followReference", label: "Follow reference" },
  { value: "projectUsages", label: "Project usages" },
];

export function Toolbar({
  nodeCount,
  problemCount,
  errorCount,
  warningCount,
  zoom,
  snapToGrid,
  referenceClickMode,
  savedLayouts,
  showShortcuts,
  showProblems,
  showOnboarding,
  shortcuts,
  onOpenFile,
  onOpenManyFiles,
  onOpenNodeSwitcher,
  onSaveLayout,
  onLoadLayout,
  onNextNode,
  onPreviousNode,
  onZoomToFit,
  onToggleSnapToGrid,
  onReferenceClickModeChange,
  onToggleProblems,
  onToggleShortcuts,
  onToggleOnboarding,
  onCloseShortcuts,
  canCycleNodes,
}: ToolbarProps) {
  const shortcutsPanelRef = useRef<HTMLDivElement | null>(null);
  const layoutMenuOptions: BaseMenuOption<string>[] = savedLayouts.map(
    (layout) => ({
      value: layout.name,
      label: layout.name,
      meta: `${layout.nodeCount} file(s)${layout.isPinned ? " | pinned" : ""}`,
    }),
  );

  useDialogFocusTrap(showShortcuts, shortcutsPanelRef);

  return (
    <>
      <div
        className={styles.toolbar}
        role="toolbar"
        aria-label="Wanderer tools"
        data-toolbar="true"
      >
        <div
          className={styles.toolbarGroup}
          role="group"
          aria-label="Reference click behavior"
        >
          <BaseSelect<ReferenceClickMode>
            label="Mode:"
            ariaLabel="Reference click behavior"
            value={referenceClickMode}
            options={REFERENCE_MODE_OPTIONS}
            placeholder="Select mode"
            selectedIndicator={
              <Icon code="check" size={12} aria-hidden="true" />
            }
            title="Choose what Cmd/Ctrl-click does in editors"
            onValueChange={onReferenceClickModeChange}
          />
        </div>
        <div
          className={styles.toolbarGroup}
          role="group"
          aria-label="File actions"
        >
          <ToolbarIconButton
            className={styles.toolbarIconButton}
            onClick={onOpenFile}
            aria-label="Open file on canvas"
            tooltip="Open file"
          >
            <Icon code="open-file" width={14} height={14} aria-hidden="true" />
          </ToolbarIconButton>
          <ToolbarIconButton
            className={styles.toolbarIconButton}
            onClick={onOpenManyFiles}
            aria-label="Open multiple files on canvas"
            tooltip="Open many"
          >
            <Icon code="open-many" width={14} height={14} aria-hidden="true" />
          </ToolbarIconButton>
          <ToolbarIconButton
            className={styles.toolbarIconButton}
            onClick={onOpenNodeSwitcher}
            aria-label="Switch to an open node"
            tooltip="Switch node"
          >
            <Icon
              code="switch-node"
              width={14}
              height={14}
              aria-hidden="true"
            />
          </ToolbarIconButton>
          <BaseMenu<string>
            label="Load layout"
            ariaLabel="Saved layouts"
            options={layoutMenuOptions}
            emptyStateLabel="No saved layouts yet."
            title="Load a saved layout"
            onSelect={onLoadLayout}
          />
          <ToolbarIconButton
            className={styles.toolbarIconButton}
            onClick={onSaveLayout}
            aria-label="Save current layout"
            tooltip="Save layout"
          >
            <Icon
              code="save-layout"
              width={14}
              height={14}
              aria-hidden="true"
            />
          </ToolbarIconButton>
        </div>

        <div
          className={styles.toolbarGroup}
          role="group"
          aria-label="View actions"
        >
          <ToolbarIconButton
            className={styles.toolbarIconButton}
            onClick={onZoomToFit}
            aria-label="Zoom to fit all nodes"
            tooltip="Zoom to fit"
          >
            <Icon code="zoom-fit" width={14} height={14} aria-hidden="true" />
          </ToolbarIconButton>
          <ToolbarIconButton
            className={styles.toolbarIconButton}
            onClick={onPreviousNode}
            aria-label="Cycle to previous node"
            tooltip="Previous node"
            disabled={!canCycleNodes}
          >
            <Icon code="prev-node" width={14} height={14} aria-hidden="true" />
          </ToolbarIconButton>
          <ToolbarIconButton
            className={styles.toolbarIconButton}
            onClick={onNextNode}
            aria-label="Cycle to next node"
            tooltip="Next node"
            disabled={!canCycleNodes}
          >
            <Icon code="next-node" width={14} height={14} aria-hidden="true" />
          </ToolbarIconButton>
          <ToolbarIconButton
            className={classNames(
              styles.toolbarIconButton,
              snapToGrid && styles.toolbarButtonActive,
            )}
            onClick={onToggleSnapToGrid}
            aria-label={
              snapToGrid ? "Disable snap to grid" : "Enable snap to grid"
            }
            tooltip={snapToGrid ? "Snap to grid on" : "Snap to grid off"}
            aria-pressed={snapToGrid}
          >
            <Icon code="snap-grid" width={14} height={14} aria-hidden="true" />
          </ToolbarIconButton>
          <ToolbarIconButton
            className={classNames(
              styles.toolbarIconButton,
              showProblems && styles.toolbarButtonActive,
            )}
            onClick={onToggleProblems}
            aria-label={
              showProblems ? "Hide problems panel" : "Show problems panel"
            }
            tooltip={showProblems ? "Hide problems" : "Show problems"}
            aria-pressed={showProblems}
          >
            <Icon code="problems" width={14} height={14} aria-hidden="true" />
          </ToolbarIconButton>
        </div>

        <div className={styles.toolbarStatus} aria-label="Canvas status">
          <span className={styles.toolbarChip} title="Open nodes on canvas">
            Nodes {nodeCount}
          </span>
          <span
            className={classNames(
              styles.toolbarChip,
              errorCount > 0
                ? styles.toolbarChipError
                : warningCount > 0
                  ? styles.toolbarChipWarning
                  : undefined,
            )}
            title="Diagnostics in open nodes"
          >
            Issues {problemCount}
          </span>
          <span className={styles.toolbarChip} title="Current zoom level">
            Zoom {Math.round(zoom * 100)}%
          </span>
        </div>

        <ToolbarIconButton
          className={classNames(
            styles.toolbarShortcuts,
            styles.toolbarIconButton,
          )}
          onClick={onToggleOnboarding}
          aria-label={
            showOnboarding ? "Hide onboarding tips" : "Show onboarding tips"
          }
          tooltip={showOnboarding ? "Hide tips" : "Show tips"}
          aria-expanded={showOnboarding}
          aria-haspopup="dialog"
        >
          <Icon code="sparkle" width={14} height={14} aria-hidden="true" />
        </ToolbarIconButton>

        <ToolbarIconButton
          className={classNames(
            styles.toolbarShortcuts,
            styles.toolbarIconButton,
          )}
          onClick={onToggleShortcuts}
          aria-label="Show keyboard shortcuts"
          tooltip="Keyboard shortcuts"
          aria-expanded={showShortcuts}
          aria-haspopup="dialog"
        >
          <Icon code="shortcuts" width={14} height={14} aria-hidden="true" />
        </ToolbarIconButton>
      </div>

      {showShortcuts ? (
        <div
          className={styles.shortcuts}
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortcuts-title"
          data-shortcuts="true"
        >
          <div
            className={styles.shortcutsBackdrop}
            aria-hidden="true"
            onClick={onCloseShortcuts}
          />
          <div
            className={styles.shortcutsPanel}
            ref={shortcutsPanelRef}
            tabIndex={-1}
          >
            <header className={styles.shortcutsHeader}>
              <h2 id="shortcuts-title">Keyboard shortcuts</h2>
              <button
                type="button"
                onClick={onCloseShortcuts}
                className={styles.uiButton}
                title="Close shortcuts dialog"
                aria-label="Close keyboard shortcuts"
              >
                Close
              </button>
            </header>
            <div className={styles.shortcutsList} role="list">
              {shortcuts.map((shortcut) => (
                <div
                  key={shortcut.id}
                  className={styles.shortcutsRow}
                  role="listitem"
                >
                  <span>{shortcut.label}</span>
                  <kbd>{shortcut.keys}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

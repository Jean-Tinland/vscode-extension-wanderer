import { type ComponentPropsWithoutRef, type ReactNode, useRef } from "react";
import type { SavedLayoutSummary } from "@shared/protocol";
import type { ShortcutHint } from "../keyboard/shortcuts";
import { useDialogFocusTrap } from "../hooks/useDialogFocusTrap";
import type { ReferenceClickMode } from "../state/interactionStore";
import { BaseMenu, type BaseMenuOption } from "./BaseMenu";
import { BaseSelect, type BaseSelectOption } from "./BaseSelect";
import { Icon } from "./Icon";
import { Tooltip } from "./Tooltip";

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
  const className = buttonProps.className
    ? `cw-ui-button cw-ui-icon-button ${buttonProps.className}`
    : "cw-ui-button cw-ui-icon-button";

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
      <div className="cw-toolbar" role="toolbar" aria-label="Wanderer tools">
        <div
          className="cw-toolbar__group"
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
          className="cw-toolbar__group"
          role="group"
          aria-label="File actions"
        >
          <ToolbarIconButton
            className="cw-toolbar__icon-button"
            onClick={onOpenFile}
            aria-label="Open file on canvas"
            tooltip="Open file"
          >
            <Icon code="open-file" width={14} height={14} aria-hidden="true" />
          </ToolbarIconButton>
          <ToolbarIconButton
            className="cw-toolbar__icon-button"
            onClick={onOpenManyFiles}
            aria-label="Open multiple files on canvas"
            tooltip="Open many"
          >
            <Icon code="open-many" width={14} height={14} aria-hidden="true" />
          </ToolbarIconButton>
          <ToolbarIconButton
            className="cw-toolbar__icon-button"
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
            label="Layouts"
            ariaLabel="Saved layouts"
            triggerValue={savedLayouts.length > 0 ? "Load" : "Empty"}
            options={layoutMenuOptions}
            emptyStateLabel="No saved layouts yet."
            title="Load a saved layout"
            onSelect={onLoadLayout}
          />
          <ToolbarIconButton
            className="cw-toolbar__icon-button"
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
          className="cw-toolbar__group"
          role="group"
          aria-label="View actions"
        >
          <ToolbarIconButton
            className="cw-toolbar__icon-button"
            onClick={onZoomToFit}
            aria-label="Zoom to fit all nodes"
            tooltip="Zoom to fit"
          >
            <Icon code="zoom-fit" width={14} height={14} aria-hidden="true" />
          </ToolbarIconButton>
          <ToolbarIconButton
            className="cw-toolbar__icon-button"
            onClick={onPreviousNode}
            aria-label="Cycle to previous node"
            tooltip="Previous node"
            disabled={!canCycleNodes}
          >
            <Icon code="prev-node" width={14} height={14} aria-hidden="true" />
          </ToolbarIconButton>
          <ToolbarIconButton
            className="cw-toolbar__icon-button"
            onClick={onNextNode}
            aria-label="Cycle to next node"
            tooltip="Next node"
            disabled={!canCycleNodes}
          >
            <Icon code="next-node" width={14} height={14} aria-hidden="true" />
          </ToolbarIconButton>
          <ToolbarIconButton
            className={`cw-toolbar__icon-button${snapToGrid ? " cw-toolbar__button--active" : ""}`}
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
            className={`cw-toolbar__icon-button${showProblems ? " cw-toolbar__button--active" : ""}`}
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

        <div className="cw-toolbar__status" aria-label="Canvas status">
          <span className="cw-toolbar__chip" title="Open nodes on canvas">
            Nodes {nodeCount}
          </span>
          <span
            className={`cw-toolbar__chip${errorCount > 0 ? " cw-toolbar__chip--error" : warningCount > 0 ? " cw-toolbar__chip--warning" : ""}`}
            title="Diagnostics in open nodes"
          >
            Issues {problemCount}
          </span>
          <span className="cw-toolbar__chip" title="Current zoom level">
            Zoom {Math.round(zoom * 100)}%
          </span>
        </div>

        <ToolbarIconButton
          className="cw-toolbar__shortcuts cw-toolbar__icon-button"
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
          className="cw-toolbar__shortcuts cw-toolbar__icon-button"
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
          className="cw-shortcuts"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cw-shortcuts-title"
        >
          <div
            className="cw-shortcuts__backdrop"
            aria-hidden="true"
            onClick={onCloseShortcuts}
          />
          <div
            className="cw-shortcuts__panel"
            ref={shortcutsPanelRef}
            tabIndex={-1}
          >
            <header className="cw-shortcuts__header">
              <h2 id="cw-shortcuts-title">Keyboard shortcuts</h2>
              <button
                type="button"
                onClick={onCloseShortcuts}
                className="cw-ui-button"
                title="Close shortcuts dialog"
                aria-label="Close keyboard shortcuts"
              >
                Close
              </button>
            </header>
            <div className="cw-shortcuts__list" role="list">
              {shortcuts.map((shortcut) => (
                <div
                  key={shortcut.id}
                  className="cw-shortcuts__row"
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

type ShortcutActionId =
  | "openFile"
  | "openManyFiles"
  | "openNodeSwitcher"
  | "saveLayout"
  | "loadLayout"
  | "focusPreviousNode"
  | "focusNextNode"
  | "openFocusedNodeInWorkbench"
  | "closeFocusedNode"
  | "toggleFocusedNodeSize"
  | "zoomToFit"
  | "toggleSnapToGrid"
  | "toggleReferenceClickMode"
  | "toggleProblemsPanel"
  | "toggleShortcutHelp";

interface ShortcutBinding {
  id: ShortcutActionId;
  label: string;
  mac: string;
  windows: string;
}

const SHORTCUTS: ShortcutBinding[] = [
  {
    id: "openFile",
    label: "Open file on canvas",
    mac: "Cmd+Alt+O",
    windows: "Ctrl+Alt+O",
  },
  {
    id: "openManyFiles",
    label: "Open multiple files on canvas",
    mac: "Cmd+Alt+Shift+O",
    windows: "Ctrl+Alt+Shift+O",
  },
  {
    id: "openNodeSwitcher",
    label: "Open node switcher",
    mac: "Cmd+Ctrl+K / Cmd+Ctrl+J",
    windows: "Ctrl+Alt+K / Ctrl+Alt+J",
  },
  {
    id: "saveLayout",
    label: "Save named layout",
    mac: "Cmd+Alt+S",
    windows: "Ctrl+Alt+S",
  },
  {
    id: "loadLayout",
    label: "Load named layout",
    mac: "Cmd+Alt+L",
    windows: "Ctrl+Alt+L",
  },
  {
    id: "focusPreviousNode",
    label: "Focus previous node",
    mac: "Cmd+Alt+P",
    windows: "Ctrl+Alt+P",
  },
  {
    id: "focusNextNode",
    label: "Focus next node",
    mac: "Cmd+Alt+N",
    windows: "Ctrl+Alt+N",
  },
  {
    id: "openFocusedNodeInWorkbench",
    label: "Open focused node in side editor",
    mac: "Cmd+Alt+E",
    windows: "Ctrl+Alt+E",
  },
  {
    id: "closeFocusedNode",
    label: "Close focused node",
    mac: "Cmd+W",
    windows: "Ctrl+W",
  },
  {
    id: "toggleFocusedNodeSize",
    label: "Toggle focused node size",
    mac: "Cmd+Alt+B",
    windows: "Ctrl+Alt+B",
  },
  {
    id: "zoomToFit",
    label: "Zoom canvas to fit",
    mac: "Cmd+Alt+0",
    windows: "Ctrl+Alt+0",
  },
  {
    id: "toggleSnapToGrid",
    label: "Toggle snap to grid",
    mac: "Cmd+Alt+G",
    windows: "Ctrl+Alt+G",
  },
  {
    id: "toggleReferenceClickMode",
    label: "Toggle reference click mode",
    mac: "Cmd+Alt+R",
    windows: "Ctrl+Alt+R",
  },
  {
    id: "toggleProblemsPanel",
    label: "Toggle problems panel",
    mac: "Cmd+Alt+M",
    windows: "Ctrl+Alt+M",
  },
  {
    id: "toggleShortcutHelp",
    label: "Toggle keyboard cheatsheet",
    mac: "Cmd+Alt+/",
    windows: "Ctrl+Alt+/",
  },
];

export interface ShortcutHint {
  id: ShortcutActionId;
  label: string;
  keys: string;
}

export function getShortcutHints(): ShortcutHint[] {
  const mac = isMacPlatform();
  return SHORTCUTS.map((shortcut) => ({
    id: shortcut.id,
    label: shortcut.label,
    keys: mac ? shortcut.mac : shortcut.windows,
  }));
}

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /mac/i.test(navigator.platform);
}

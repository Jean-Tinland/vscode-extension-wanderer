import { create } from "zustand";
import type { EditorSettings } from "@shared/protocol";

const defaults: EditorSettings = {
  fontSize: 14,
  fontFamily: "'Droid Sans Mono', 'monospace'",
  fontLigatures: false,
  lineHeight: 0,
  tabSize: 4,
  insertSpaces: true,
  wordWrap: "off",
  wordWrapColumn: 80,
  minimap: true,
  renderWhitespace: "selection",
  cursorStyle: "line",
  cursorBlinking: "blink",
  smoothScrolling: false,
  bracketPairColorization: true,
  bracketPairColorizationIndependentColorPoolPerBracketType: false,
  guides: {
    bracketPairs: false,
    indentation: true,
    highlightActiveIndentation: true,
  },
  linkedEditing: false,
  formatOnPaste: false,
  formatOnType: false,
  stickyScroll: false,
  renderLineHighlight: "line",
};

interface EditorSettingsState {
  settings: EditorSettings;
  set: (s: EditorSettings) => void;
}

export const useEditorSettingsStore = create<EditorSettingsState>((set) => ({
  settings: defaults,
  set: (settings) => set({ settings }),
}));

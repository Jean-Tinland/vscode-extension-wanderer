import { create } from "zustand";

export const REFERENCE_CLICK_MODES = [
  "followReference",
  "projectUsages",
] as const;

export type ReferenceClickMode = (typeof REFERENCE_CLICK_MODES)[number];

export const DEFAULT_REFERENCE_CLICK_MODE: ReferenceClickMode =
  "followReference";

interface InteractionState {
  snapToGrid: boolean;
  gridSize: number;
  referenceClickMode: ReferenceClickMode;
  setSnapToGrid: (value: boolean) => void;
  toggleSnapToGrid: () => void;
  setGridSize: (size: number) => void;
  setReferenceClickMode: (mode: ReferenceClickMode) => void;
  toggleReferenceClickMode: () => void;
}

export const useInteractionStore = create<InteractionState>((set) => ({
  snapToGrid: false,
  gridSize: 24,
  referenceClickMode: DEFAULT_REFERENCE_CLICK_MODE,
  setSnapToGrid: (value) => set({ snapToGrid: value }),
  toggleSnapToGrid: () => set((s) => ({ snapToGrid: !s.snapToGrid })),
  setGridSize: (size) =>
    set({
      gridSize: Number.isFinite(size) ? Math.min(Math.max(size, 8), 80) : 24,
    }),
  setReferenceClickMode: (mode) => set({ referenceClickMode: mode }),
  toggleReferenceClickMode: () =>
    set((s) => ({
      referenceClickMode:
        s.referenceClickMode === "followReference"
          ? "projectUsages"
          : "followReference",
    })),
}));

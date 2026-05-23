import { create } from "zustand";

interface ViewportState {
  x: number;
  y: number;
  zoom: number;
  set: (x: number, y: number, zoom: number) => void;
}

export const useViewportStore = create<ViewportState>((set) => ({
  x: 0,
  y: 0,
  zoom: 1,
  set: (x, y, zoom) => set({ x, y, zoom }),
}));

import type { DiagnosticData } from "@shared/protocol";
import { create } from "zustand";

export interface DiagnosticsCounts {
  errors: number;
  warnings: number;
  infos: number;
  hints: number;
  total: number;
}

export interface FileDiagnostics {
  uri: string;
  markers: DiagnosticData[];
  counts: DiagnosticsCounts;
  updatedAt: number;
}

interface DiagnosticsState {
  byUri: Record<string, FileDiagnostics>;
  setDiagnostics: (uri: string, markers: DiagnosticData[]) => void;
  clearDiagnostics: (uri: string) => void;
  clearAllDiagnostics: () => void;
}

export function countDiagnostics(markers: DiagnosticData[]): DiagnosticsCounts {
  const counts: DiagnosticsCounts = {
    errors: 0,
    warnings: 0,
    infos: 0,
    hints: 0,
    total: markers.length,
  };

  for (const marker of markers) {
    switch (severityBucket(marker.severity)) {
      case "error":
        counts.errors += 1;
        break;
      case "warning":
        counts.warnings += 1;
        break;
      case "info":
        counts.infos += 1;
        break;
      case "hint":
        counts.hints += 1;
        break;
    }
  }

  return counts;
}

export function severityBucket(
  severity: number,
): "error" | "warning" | "info" | "hint" {
  if (severity >= 8) return "error";
  if (severity >= 4) return "warning";
  if (severity >= 2) return "info";
  return "hint";
}

export const useDiagnosticsStore = create<DiagnosticsState>((set) => ({
  byUri: {},
  setDiagnostics: (uri, markers) =>
    set((state) => ({
      byUri: {
        ...state.byUri,
        [uri]: {
          uri,
          markers,
          counts: countDiagnostics(markers),
          updatedAt: Date.now(),
        },
      },
    })),
  clearDiagnostics: (uri) =>
    set((state) => {
      if (!(uri in state.byUri)) return state;
      const copy = { ...state.byUri };
      delete copy[uri];
      return { byUri: copy };
    }),
  clearAllDiagnostics: () => set({ byUri: {} }),
}));

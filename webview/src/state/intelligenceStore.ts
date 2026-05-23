import { create } from "zustand";

export type IntelligenceTimeoutKind = "hover" | "completion";

export interface EditorIntelligenceActions {
  retryHover: () => void;
  retryCompletion: () => void;
}

export interface IntelligenceTimeoutNotice {
  kind: IntelligenceTimeoutKind;
  fileUri: string;
  message: string;
  canRetry: boolean;
  timestamp: number;
}

interface IntelligenceState {
  actionsByUri: Record<string, EditorIntelligenceActions>;
  timeoutNotice: IntelligenceTimeoutNotice | null;
  registerEditorActions: (
    fileUri: string,
    actions: EditorIntelligenceActions,
  ) => () => void;
  reportTimeout: (kind: IntelligenceTimeoutKind, fileUri: string) => void;
  reportSuccess: (kind: IntelligenceTimeoutKind, fileUri: string) => void;
  dismissTimeoutNotice: () => void;
  retryTimeoutNotice: () => void;
}

export const useIntelligenceStore = create<IntelligenceState>((set, get) => ({
  actionsByUri: {},
  timeoutNotice: null,

  registerEditorActions: (fileUri, actions) => {
    set((state) => ({
      actionsByUri: {
        ...state.actionsByUri,
        [fileUri]: actions,
      },
    }));

    return () => {
      set((state) => {
        if (state.actionsByUri[fileUri] !== actions) return state;
        const copy = { ...state.actionsByUri };
        delete copy[fileUri];
        return { actionsByUri: copy };
      });
    };
  },

  reportTimeout: (kind, fileUri) => {
    const action = get().actionsByUri[fileUri];
    set({
      timeoutNotice: {
        kind,
        fileUri,
        message:
          kind === "hover"
            ? "Hover request timed out."
            : "Completion request timed out.",
        canRetry: Boolean(action),
        timestamp: Date.now(),
      },
    });
  },

  reportSuccess: (kind, fileUri) => {
    const current = get().timeoutNotice;
    if (!current) return;
    if (current.kind !== kind || current.fileUri !== fileUri) return;
    set({ timeoutNotice: null });
  },

  dismissTimeoutNotice: () => set({ timeoutNotice: null }),

  retryTimeoutNotice: () => {
    const notice = get().timeoutNotice;
    if (!notice) return;

    const actions = get().actionsByUri[notice.fileUri];
    if (!actions) {
      set({ timeoutNotice: null });
      return;
    }

    if (notice.kind === "hover") {
      actions.retryHover();
    } else {
      actions.retryCompletion();
    }
    set({ timeoutNotice: null });
  },
}));

import * as vscode from "vscode";
import type { CanvasCommand } from "../../shared/protocol";

type CanvasPanelModule = typeof import("./canvasPanel.js");
type CanvasPanelInstance = import("./canvasPanel.js").CanvasPanel;
type SidebarViewProviderModule = typeof import("./sidebarViewProvider.js");
type LayoutStoreModule = typeof import("./persistence/layoutStore.js");
type LayoutStoreInstance = import("./persistence/layoutStore.js").LayoutStore;

const SIDEBAR_VIEW_TYPE = "wanderer.sidebarCanvas";

let canvasPanelModulePromise: Promise<CanvasPanelModule> | undefined;
let sidebarViewProviderModulePromise:
  | Promise<SidebarViewProviderModule>
  | undefined;
let layoutStoreModulePromise: Promise<LayoutStoreModule> | undefined;

function loadCanvasPanelModule(): Promise<CanvasPanelModule> {
  if (!canvasPanelModulePromise) {
    canvasPanelModulePromise = import("./canvasPanel.js");
  }
  return canvasPanelModulePromise;
}

function loadSidebarViewProviderModule(): Promise<SidebarViewProviderModule> {
  if (!sidebarViewProviderModulePromise) {
    sidebarViewProviderModulePromise = import("./sidebarViewProvider.js");
  }
  return sidebarViewProviderModulePromise;
}

function loadLayoutStoreModule(): Promise<LayoutStoreModule> {
  if (!layoutStoreModulePromise) {
    layoutStoreModulePromise = import("./persistence/layoutStore.js");
  }
  return layoutStoreModulePromise;
}

export function activate(context: vscode.ExtensionContext): void {
  let layoutStorePromise: Promise<LayoutStoreInstance> | undefined;
  const getLayoutStore = async (): Promise<LayoutStoreInstance> => {
    if (!layoutStorePromise) {
      layoutStorePromise = loadLayoutStoreModule().then(
        ({ LayoutStore }) => new LayoutStore(context),
      );
    }
    return layoutStorePromise;
  };

  const ensureCanvasPanel = async (): Promise<CanvasPanelInstance> => {
    const [{ CanvasPanel }, layoutStore] = await Promise.all([
      loadCanvasPanelModule(),
      getLayoutStore(),
    ]);
    return CanvasPanel.current ?? CanvasPanel.show(context, layoutStore);
  };

  const reviveCanvasPanel = async (
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> => {
    const [{ CanvasPanel }, layoutStore] = await Promise.all([
      loadCanvasPanelModule(),
      getLayoutStore(),
    ]);
    CanvasPanel.revive(webviewPanel, context, layoutStore);
  };

  const openCurrentFileOnCanvas = async (): Promise<void> => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage("Wanderer: no active editor.");
      return;
    }
    const panel = await ensureCanvasPanel();
    panel.openFileOnCanvas(editor.document.uri, {
      startLine: editor.selection.active.line,
      startCharacter: editor.selection.active.character,
      endLine: editor.selection.active.line,
      endCharacter: editor.selection.active.character,
    });
  };

  let sidebarProviderPromise: Promise<vscode.WebviewViewProvider> | undefined;
  const getSidebarProvider = async (): Promise<vscode.WebviewViewProvider> => {
    if (!sidebarProviderPromise) {
      sidebarProviderPromise = (async () => {
        const { SidebarViewProvider } = await loadSidebarViewProviderModule();
        return new SidebarViewProvider({
          openCanvas: async () => {
            await ensureCanvasPanel();
          },
        });
      })();
    }
    return sidebarProviderPromise;
  };

  const lazySidebarProvider: vscode.WebviewViewProvider = {
    resolveWebviewView: async (webviewView, resolveContext, token) => {
      const provider = await getSidebarProvider();
      await provider.resolveWebviewView(webviewView, resolveContext, token);
    },
  };

  const postCanvasCommand = async (command: CanvasCommand): Promise<void> => {
    const panel = await ensureCanvasPanel();
    panel.postCommand(command);
  };
  const registerCanvasCommand = (
    commandId: string,
    command: CanvasCommand,
  ): vscode.Disposable =>
    vscode.commands.registerCommand(commandId, () => {
      void postCanvasCommand(command);
    });

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SIDEBAR_VIEW_TYPE,
      lazySidebarProvider,
    ),

    vscode.window.registerWebviewPanelSerializer("wanderer.canvas", {
      deserializeWebviewPanel: async (webviewPanel) => {
        await reviveCanvasPanel(webviewPanel);
      },
    }),

    {
      dispose: () => {
        void layoutStorePromise?.then((store) => store.dispose());
      },
    },

    vscode.commands.registerCommand("wanderer.openCanvas", async () => {
      await ensureCanvasPanel();
    }),

    vscode.commands.registerCommand(
      "wanderer.openCurrentFileOnCanvas",
      async () => {
        await openCurrentFileOnCanvas();
      },
    ),

    vscode.commands.registerCommand("wanderer.revealDefinition", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const panel = await ensureCanvasPanel();
      await panel.revealDefinitionFromActiveEditor(editor);
    }),

    registerCanvasCommand("wanderer.canvas.openFile", "openFile"),
    registerCanvasCommand("wanderer.canvas.openManyFiles", "openManyFiles"),
    registerCanvasCommand(
      "wanderer.canvas.openNodeSwitcher",
      "openNodeSwitcher",
    ),
    registerCanvasCommand(
      "wanderer.canvas.focusPreviousNode",
      "focusPreviousNode",
    ),
    registerCanvasCommand("wanderer.canvas.focusNextNode", "focusNextNode"),
    registerCanvasCommand(
      "wanderer.canvas.openFocusedNodeInWorkbench",
      "openFocusedNodeInWorkbench",
    ),
    registerCanvasCommand(
      "wanderer.canvas.closeFocusedNode",
      "closeFocusedNode",
    ),
    registerCanvasCommand(
      "wanderer.canvas.toggleFocusedNodeSize",
      "toggleFocusedNodeSize",
    ),
    registerCanvasCommand(
      "wanderer.canvas.toggleSnapToGrid",
      "toggleSnapToGrid",
    ),
    registerCanvasCommand(
      "wanderer.canvas.toggleReferenceClickMode",
      "toggleReferenceClickMode",
    ),
    registerCanvasCommand(
      "wanderer.canvas.toggleProblemsPanel",
      "toggleProblemsPanel",
    ),
    registerCanvasCommand(
      "wanderer.canvas.toggleShortcutHelp",
      "toggleShortcutHelp",
    ),

    vscode.commands.registerCommand("wanderer.zoomToFit", () => {
      void postCanvasCommand("zoomToFit");
    }),

    vscode.commands.registerCommand("wanderer.saveLayout", async () => {
      if (!canvasPanelModulePromise) {
        vscode.window.showWarningMessage("Wanderer: open the canvas first.");
        return;
      }
      const { CanvasPanel } = await canvasPanelModulePromise;
      const panel = CanvasPanel.current;
      if (!panel) {
        vscode.window.showWarningMessage("Wanderer: open the canvas first.");
        return;
      }
      const name = await vscode.window.showInputBox({
        prompt: "Layout name",
        placeHolder: "e.g. Auth flow, Main architecture…",
        validateInput: (v) =>
          v.trim().length === 0 ? "Name cannot be empty" : undefined,
      });
      if (!name) return;
      panel.saveNamedLayout(name.trim());
    }),

    vscode.commands.registerCommand(
      "wanderer.loadLayout",
      async (name?: string) => {
        const layoutStore = await getLayoutStore();
        if (!name) {
          const layouts = layoutStore.list();
          if (layouts.length === 0) {
            vscode.window.showInformationMessage(
              "Wanderer: no saved layouts yet.",
            );
            return;
          }
          const pick = await vscode.window.showQuickPick(
            layouts.map((layout) => ({
              label: layout.isPinned ? `$(pinned) ${layout.name}` : layout.name,
              description: `${layout.snapshot.nodes.length} file(s)`,
              detail:
                layout.lastOpenedAt !== undefined
                  ? `Last opened ${new Date(layout.lastOpenedAt).toLocaleString()}`
                  : `Saved ${new Date(layout.savedAt).toLocaleString()}`,
              layout,
            })),
            {
              placeHolder: "Select a saved layout",
              matchOnDescription: true,
              matchOnDetail: true,
            },
          );
          if (!pick) return;
          name = pick.layout.name;
        }
        if (!name) return;

        const saved = layoutStore.get(name);
        if (!saved) {
          vscode.window.showWarningMessage(
            `Wanderer: layout "${name}" not found.`,
          );
          return;
        }
        const panel = await ensureCanvasPanel();
        panel.loadSnapshot(saved.snapshot);
        layoutStore.markOpened(name);
      },
    ),

    vscode.commands.registerCommand(
      "wanderer.duplicateLayout",
      async (item?: string) => {
        const layoutStore = await getLayoutStore();
        let sourceName = item;
        if (!sourceName) {
          const pick = await vscode.window.showQuickPick(
            layoutStore.list().map((layout) => ({
              label: layout.name,
              description: `${layout.snapshot.nodes.length} file(s)`,
              layout,
            })),
            {
              placeHolder: "Select a layout to duplicate",
              matchOnDescription: true,
            },
          );
          if (!pick) return;
          sourceName = pick.layout.name;
        }

        const existingNames = new Set(layoutStore.list().map((l) => l.name));
        const suggestedName = suggestDuplicateLayoutName(
          sourceName,
          existingNames,
        );
        const duplicateName = await vscode.window.showInputBox({
          prompt: `Duplicate layout "${sourceName}" as`,
          value: suggestedName,
          validateInput: (v) => {
            const name = v.trim();
            if (name.length === 0) return "Name cannot be empty";
            if (existingNames.has(name)) {
              return `A layout named "${name}" already exists`;
            }
            return undefined;
          },
        });
        if (!duplicateName) return;

        const ok = layoutStore.duplicate(sourceName, duplicateName.trim());
        if (!ok) {
          vscode.window.showWarningMessage(
            `Wanderer: failed to duplicate layout "${sourceName}".`,
          );
        }
      },
    ),

    vscode.commands.registerCommand(
      "wanderer.toggleLayoutPin",
      async (name?: string) => {
        const layoutStore = await getLayoutStore();
        if (!name) {
          const pick = await vscode.window.showQuickPick(
            layoutStore.list().map((layout) => ({
              label: layout.name,
              description: `${layout.snapshot.nodes.length} file(s)`,
            })),
            {
              placeHolder: "Select a layout to pin or unpin",
              matchOnDescription: true,
            },
          );
          if (!pick) return;
          name = pick.label;
        }

        if (!name) return;
        const pinned = layoutStore.togglePinned(name);
        if (pinned === undefined) {
          vscode.window.showWarningMessage(
            `Wanderer: layout "${name}" not found.`,
          );
        }
      },
    ),

    vscode.commands.registerCommand(
      "wanderer.renameLayout",
      async (name?: string) => {
        const layoutStore = await getLayoutStore();
        if (!name) {
          const pick = await vscode.window.showQuickPick(
            layoutStore.list().map((layout) => ({
              label: layout.name,
              description: `${layout.snapshot.nodes.length} file(s)`,
            })),
            {
              placeHolder: "Select a layout to rename",
              matchOnDescription: true,
            },
          );
          if (!pick) return;
          name = pick.label;
        }

        if (!name) return;
        const newName = await vscode.window.showInputBox({
          prompt: "New layout name",
          value: name,
          validateInput: (v) =>
            v.trim().length === 0 ? "Name cannot be empty" : undefined,
        });
        if (!newName || newName.trim() === name) return;
        const ok = layoutStore.rename(name, newName.trim());
        if (!ok) {
          vscode.window.showWarningMessage(
            `Wanderer: a layout named "${newName.trim()}" already exists.`,
          );
        }
      },
    ),

    vscode.commands.registerCommand(
      "wanderer.deleteLayout",
      async (name?: string) => {
        const layoutStore = await getLayoutStore();
        if (!name) {
          const pick = await vscode.window.showQuickPick(
            layoutStore.list().map((layout) => ({
              label: layout.name,
              description: `${layout.snapshot.nodes.length} file(s)`,
            })),
            {
              placeHolder: "Select a layout to delete",
              matchOnDescription: true,
            },
          );
          if (!pick) return;
          name = pick.label;
        }

        if (!name) return;
        const answer = await vscode.window.showWarningMessage(
          `Delete layout "${name}"?`,
          { modal: true },
          "Delete",
        );
        if (answer !== "Delete") return;
        layoutStore.deleteNamed(name);
      },
    ),

    vscode.commands.registerCommand("wanderer.resetLayout", async () => {
      await context.workspaceState.update("wanderer.layout", undefined);
      vscode.window.showInformationMessage(
        "Wanderer: layout reset. Reopen the canvas.",
      );
    }),
  );
}

export async function deactivate(): Promise<void> {
  if (!canvasPanelModulePromise) return;
  const { CanvasPanel } = await canvasPanelModulePromise;
  CanvasPanel.current?.dispose();
}

function suggestDuplicateLayoutName(
  baseName: string,
  existingNames: ReadonlySet<string>,
): string {
  const normalizedBase = `${baseName} copy`;
  if (!existingNames.has(normalizedBase)) return normalizedBase;

  for (let i = 2; i <= 999; i += 1) {
    const candidate = `${baseName} copy ${i}`;
    if (!existingNames.has(candidate)) return candidate;
  }
  return `${baseName} copy ${Date.now()}`;
}

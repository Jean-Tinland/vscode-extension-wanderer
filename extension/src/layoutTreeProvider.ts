import * as vscode from "vscode";
import type { LayoutStore, SavedLayout } from "./persistence/layoutStore";

export class LayoutTreeProvider implements vscode.TreeDataProvider<LayoutItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    LayoutItem | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly store: LayoutStore) {
    store.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: LayoutItem): vscode.TreeItem {
    return element;
  }

  getChildren(): LayoutItem[] {
    return this.store.list().map((l) => new LayoutItem(l));
  }
}

export class LayoutItem extends vscode.TreeItem {
  constructor(public readonly layout: SavedLayout) {
    super(layout.name, vscode.TreeItemCollapsibleState.None);
    const openedAt =
      layout.lastOpenedAt !== undefined
        ? new Date(layout.lastOpenedAt).toLocaleString()
        : "Never";
    this.tooltip = [
      `${layout.name} — ${layout.snapshot.nodes.length} file(s)`,
      `Saved ${new Date(layout.savedAt).toLocaleString()}`,
      `Updated ${new Date(layout.updatedAt).toLocaleString()}`,
      `Last opened ${openedAt}`,
    ].join("\n");
    const bits = [`${layout.snapshot.nodes.length} files`];
    if (layout.isPinned) bits.push("Pinned");
    if (layout.lastOpenedAt !== undefined) bits.push("Recent");
    this.description = bits.join(" • ");
    this.contextValue = layout.isPinned ? "savedLayoutPinned" : "savedLayout";
    this.iconPath = new vscode.ThemeIcon(layout.isPinned ? "pinned" : "layout");
    this.command = {
      command: "wanderer.loadLayout",
      title: "Load Layout",
      arguments: [layout.name],
    };
  }
}

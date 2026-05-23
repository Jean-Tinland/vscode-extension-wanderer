import * as vscode from "vscode";
import type { EditDelta, ExtensionMessage } from "../../../shared/protocol";

/**
 * Watches text documents the canvas has loaded and forwards content changes
 * to the webview. Also applies inbound edits from the webview without
 * triggering an echo by suppressing the expected post-edit version.
 */
export class DocumentSync implements vscode.Disposable {
  private readonly watched = new Set<string>();
  private readonly suppressedVersions = new Map<string, Set<number>>();
  private readonly editQueues = new Map<string, Promise<void>>();
  private readonly subs: vscode.Disposable[] = [];

  constructor(private readonly post: (msg: ExtensionMessage) => void) {
    this.subs.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        const key = e.document.uri.toString();
        if (!this.watched.has(key)) return;
        const suppressed = this.suppressedVersions.get(key);
        if (suppressed?.has(e.document.version)) {
          suppressed.delete(e.document.version);
          if (suppressed.size === 0) this.suppressedVersions.delete(key);
          return;
        }
        this.post({
          type: "documentChanged",
          uri: key,
          content: e.document.getText(),
          version: e.document.version,
          isDirty: e.document.isDirty,
        });
      }),
      vscode.workspace.onDidSaveTextDocument((doc) => {
        const key = doc.uri.toString();
        if (!this.watched.has(key)) return;
        this.post({
          type: "documentChanged",
          uri: key,
          content: doc.getText(),
          version: doc.version,
          isDirty: doc.isDirty,
        });
      }),
    );
  }

  watch(uri: vscode.Uri): void {
    this.watched.add(uri.toString());
  }

  isTracked(uri: vscode.Uri): boolean {
    return this.watched.has(uri.toString());
  }

  async applyFullText(uri: vscode.Uri, text: string): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(uri);
    if (doc.getText() === text) return;
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(0, 0, doc.lineCount, 0);
    edit.replace(uri, fullRange, text);
    // Register suppression before applyEdit so we never race onDidChange.
    const key = uri.toString();
    const expectedVersion = doc.version + 1;
    this.suppressVersion(key, expectedVersion);
    const ok = await vscode.workspace.applyEdit(edit);
    if (!ok) this.unsuppressVersion(key, expectedVersion);
  }

  async applyDelta(uri: vscode.Uri, changes: EditDelta[]): Promise<void> {
    const key = uri.toString();
    // Serialize per-URI to keep version tracking deterministic.
    const prev = this.editQueues.get(key) ?? Promise.resolve();
    const next = prev.then(() => this.doApplyDelta(uri, changes));
    this.editQueues.set(key, next);
    await next;
  }

  async save(uri: vscode.Uri): Promise<boolean> {
    const key = uri.toString();
    const pendingEdits = this.editQueues.get(key);
    if (pendingEdits) {
      try {
        await pendingEdits;
      } catch {
        // Best-effort: still attempt save with the latest document state.
      }
    }

    const doc = await vscode.workspace.openTextDocument(uri);
    if (!doc.isDirty) return true;
    return doc.save();
  }

  private async doApplyDelta(
    uri: vscode.Uri,
    changes: EditDelta[],
  ): Promise<void> {
    if (changes.length === 0) return;
    const doc = await vscode.workspace.openTextDocument(uri);
    const edit = new vscode.WorkspaceEdit();
    // Apply from the end of the document to avoid offset drift in hosts that
    // execute edits sequentially.
    const ordered = [...changes].sort((a, b) => b.rangeOffset - a.rangeOffset);
    for (const c of ordered) {
      if (c.rangeOffset < 0 || c.rangeLength < 0) continue;
      const startPos = doc.positionAt(c.rangeOffset);
      const endPos = doc.positionAt(c.rangeOffset + c.rangeLength);
      edit.replace(uri, new vscode.Range(startPos, endPos), c.text);
    }
    const key = uri.toString();
    const expectedVersion = doc.version + 1;
    this.suppressVersion(key, expectedVersion);
    const ok = await vscode.workspace.applyEdit(edit);
    if (!ok) this.unsuppressVersion(key, expectedVersion);
  }

  private suppressVersion(key: string, version: number): void {
    let set = this.suppressedVersions.get(key);
    if (!set) {
      set = new Set();
      this.suppressedVersions.set(key, set);
    }
    set.add(version);
  }

  private unsuppressVersion(key: string, version: number): void {
    const set = this.suppressedVersions.get(key);
    if (!set) return;
    set.delete(version);
    if (set.size === 0) this.suppressedVersions.delete(key);
  }

  dispose(): void {
    for (const sub of this.subs) sub.dispose();
  }
}

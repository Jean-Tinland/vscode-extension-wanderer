import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  DEFAULT_REFERENCE_CLICK_MODE,
  REFERENCE_CLICK_MODES,
} from "../../shared/protocol";
import type {
  CanvasCommand,
  CanvasNode,
  CanvasSettings,
  DiagnosticData,
  EditorSettings,
  ExtensionMessage,
  GraphSnapshot,
  RangeLike,
  ReferenceClickMode,
  SavedLayoutSummary,
  WebviewMessage,
} from "../../shared/protocol";
import { isWebviewMessage } from "../../shared/guards";
import { LayoutStore } from "./persistence/layoutStore";
import { LanguageProxy } from "./services/languageProxy";
import { DocumentSync } from "./services/documentSync";
import { ThemeService } from "./services/themeService";
import { CopilotService } from "./services/copilotService";

const RECENT_FILES_KEY = "wanderer.recentFiles";
const REFERENCE_CLICK_MODE_KEY = "wanderer.referenceClickMode";
const MAX_RECENT_FILES = 50;
const BLOCKED_URI_SCHEMES = new Set([
  "command",
  "javascript",
  "data",
  "http",
  "https",
]);
const WRITABLE_URI_SCHEMES = new Set([
  "file",
  "untitled",
  "vscode-remote",
  "vscode-userdata",
]);
const REFERENCE_CLICK_MODE_SET = new Set<string>(REFERENCE_CLICK_MODES);

export class CanvasPanel {
  static current: CanvasPanel | undefined;
  static readonly viewType = "wanderer.canvas";

  private static getPanelOptions(
    context: vscode.ExtensionContext,
  ): vscode.WebviewPanelOptions & vscode.WebviewOptions {
    return {
      retainContextWhenHidden: true,
      ...CanvasPanel.getWebviewOptions(context),
    };
  }

  private static getWebviewOptions(
    context: vscode.ExtensionContext,
  ): vscode.WebviewOptions {
    return {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, "webview", "dist"),
      ],
    };
  }

  static show(
    context: vscode.ExtensionContext,
    layoutStore?: LayoutStore,
  ): CanvasPanel {
    if (CanvasPanel.current) {
      CanvasPanel.current.panel.reveal(vscode.ViewColumn.Active);
      return CanvasPanel.current;
    }
    const panel = vscode.window.createWebviewPanel(
      CanvasPanel.viewType,
      "Wanderer",
      vscode.ViewColumn.Active,
      CanvasPanel.getPanelOptions(context),
    );
    CanvasPanel.current = new CanvasPanel(
      panel,
      context,
      layoutStore ?? new LayoutStore(context),
    );
    return CanvasPanel.current;
  }

  static revive(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    layoutStore?: LayoutStore,
  ): CanvasPanel {
    if (CanvasPanel.current?.panel === panel) {
      return CanvasPanel.current;
    }
    if (CanvasPanel.current) {
      CanvasPanel.current.dispose();
    }

    panel.title = "Wanderer";
    panel.webview.options = CanvasPanel.getWebviewOptions(context);

    CanvasPanel.current = new CanvasPanel(
      panel,
      context,
      layoutStore ?? new LayoutStore(context),
    );
    return CanvasPanel.current;
  }

  private readonly disposables: vscode.Disposable[] = [];
  private language: LanguageProxy | undefined;
  private docs: DocumentSync | undefined;
  private themeService: ThemeService | undefined;
  private copilot: CopilotService | undefined;
  private diagnosticsSubscription: vscode.Disposable | undefined;
  private editorSettingsSubscription: vscode.Disposable | undefined;
  private ready = false;
  private readonly pendingOpens: Array<() => void> = [];

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    private readonly layoutStore: LayoutStore,
  ) {
    panel.webview.html = this.renderHtml();

    this.disposables.push(
      this.layoutStore.onDidChange(() => {
        if (!this.ready) return;
        this.post({
          type: "savedLayoutsChanged",
          layouts: this.toSavedLayoutSummaries(),
        });
      }),

      panel.onDidDispose(() => this.dispose()),
      panel.webview.onDidReceiveMessage((m: unknown) => {
        if (!isWebviewMessage(m)) {
          logFromWebview("warn", "Ignored malformed message payload.");
          return;
        }
        void this.handleMessage(m);
      }),
    );
  }

  dispose(): void {
    if (CanvasPanel.current === this) CanvasPanel.current = undefined;
    this.copilot?.dispose();
    while (this.disposables.length) this.disposables.pop()?.dispose();
    this.panel.dispose();
  }

  post(msg: ExtensionMessage): void {
    void this.panel.webview.postMessage(msg);
  }

  postCommand(command: CanvasCommand): void {
    const run = () => this.post({ type: "command", command });
    if (this.ready) run();
    else this.pendingOpens.push(run);
  }

  private getLanguage(): LanguageProxy {
    if (!this.language) {
      this.language = new LanguageProxy();
    }
    return this.language;
  }

  private getDocumentSync(): DocumentSync {
    if (!this.docs) {
      this.docs = new DocumentSync((msg) => this.post(msg));
      this.disposables.push(this.docs);
      this.ensureDiagnosticsSubscription();
    }
    return this.docs;
  }

  private getThemeService(): ThemeService {
    if (!this.themeService) {
      this.themeService = new ThemeService((theme) => {
        this.post({ type: "themeChanged", theme });
      });
      this.disposables.push(this.themeService);
    }
    return this.themeService;
  }

  private getCopilotService(): CopilotService {
    if (!this.copilot) {
      this.copilot = new CopilotService();
    }
    return this.copilot;
  }

  private ensureDiagnosticsSubscription(): void {
    if (this.diagnosticsSubscription) return;
    this.diagnosticsSubscription = vscode.languages.onDidChangeDiagnostics(
      (e) => this.onDiagnosticsChanged(e),
    );
    this.disposables.push(this.diagnosticsSubscription);
  }

  private ensureEditorSettingsSubscription(): void {
    if (this.editorSettingsSubscription) return;
    this.editorSettingsSubscription = vscode.workspace.onDidChangeConfiguration(
      (e) => {
        if (!this.ready) return;
        if (
          e.affectsConfiguration("editor") ||
          e.affectsConfiguration("wanderer.webview.editor")
        ) {
          this.post({
            type: "editorSettingsChanged",
            editorSettings: this.readEditorSettings(),
          });
        }
      },
    );
    this.disposables.push(this.editorSettingsSubscription);
  }

  /** Request the current snapshot from the webview and save it as a named layout. */
  saveNamedLayout(name: string): void {
    // Ask the webview for the current snapshot via requestSaveLayout,
    // then intercept the response.
    const unsub = this.panel.webview.onDidReceiveMessage((msg: unknown) => {
      if (!isWebviewMessage(msg)) return;
      if (msg.type === "saveLayout") {
        unsub.dispose();
        this.layoutStore.saveNamed(name, msg.snapshot);
        vscode.window.showInformationMessage(
          `Wanderer: layout "${name}" saved.`,
        );
      }
    });
    this.postCommand("requestSaveLayout");
  }

  /** Load a named snapshot into the canvas. */
  loadSnapshot(snapshot: GraphSnapshot): void {
    const run = () =>
      this.post({
        type: "init",
        layout: snapshot,
        settings: this.readSettings(),
        theme: this.getThemeService().resolve(),
        editorSettings: this.readEditorSettings(),
        savedLayouts: this.toSavedLayoutSummaries(),
        referenceClickMode: this.readReferenceClickMode(),
      });
    if (this.ready) run();
    else this.pendingOpens.push(run);
  }

  openFileOnCanvas(uri: vscode.Uri, revealRange?: RangeLike): void {
    this.assertAllowedUri(uri, "open file");
    this.getDocumentSync().watch(uri);
    const run = () => {
      this.post({
        type: "openFileResult" as const,
        requestId: randomUUID(),
        ...this.makeNodePayloadSync(uri, revealRange),
      } as ExtensionMessage);
    };
    if (this.ready) run();
    else this.pendingOpens.push(run);
  }

  async revealDefinitionFromActiveEditor(
    editor: vscode.TextEditor,
  ): Promise<void> {
    const pos = editor.selection.active;
    const locations = await this.getLanguage().getDefinitions(
      editor.document.uri,
      pos,
    );
    if (locations.length === 0) {
      vscode.window.showInformationMessage("Wanderer: no definition found.");
      return;
    }
    for (const loc of locations) {
      try {
        const targetUri = this.parseRequestUri(
          loc.uri,
          "open definition target",
        );
        this.openFileOnCanvas(targetUri, loc.range);
      } catch {
        // Ignore unsupported providers that return non-document URIs.
      }
    }
  }

  // -------------- internal --------------

  private async handleMessage(msg: WebviewMessage): Promise<void> {
    try {
      await this.dispatch(msg);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.post({
        type: "error",
        message,
        requestId: (msg as { requestId?: string }).requestId,
      });
    }
  }

  private dispatch(msg: WebviewMessage): void | Promise<void> {
    const handler = this.handlers[msg.type] as
      | ((m: WebviewMessage) => void | Promise<void>)
      | undefined;
    return handler?.(msg);
  }

  private readonly handlers: {
    [K in WebviewMessage["type"]]: (
      msg: Extract<WebviewMessage, { type: K }>,
    ) => void | Promise<void>;
  } = {
    ready: () => this.onReady(),
    openFile: (m) => this.onOpenFile(m),
    requestDefinition: (m) => this.onRequestDefinition(m),
    requestReferences: (m) => this.onRequestReferences(m),
    applyEdit: (m) => this.onApplyEdit(m),
    applyDelta: (m) => this.onApplyDelta(m),
    saveLayout: (m) => this.layoutStore.save(m.snapshot),
    revealInWorkbench: (m) => this.onRevealInWorkbench(m),
    log: (m) => logFromWebview(m.level, m.message),
    requestOpenDialog: (m) => this.onRequestOpenDialog(m),
    requestSaveNamedLayout: () => this.onRequestSaveNamedLayout(),
    requestLoadNamedLayout: () => this.onRequestLoadNamedLayout(),
    requestCloseCanvasTab: () => this.onRequestCloseCanvasTab(),
    loadNamedLayout: (m) => this.onLoadNamedLayout(m),
    setReferenceClickMode: (m) => this.onSetReferenceClickMode(m),
    requestHover: (m) => this.onRequestHover(m),
    requestCompletion: (m) => this.onRequestCompletion(m),
    requestFormat: (m) => this.onRequestFormat(m),
    requestSaveDocument: (m) => this.onRequestSaveDocument(m),
    requestInlineCompletion: (m) => this.onRequestInlineCompletion(m),
    requestInlineChat: (m) => this.onRequestInlineChat(m),
    cancelRequest: (m) => this.copilot?.cancel(m.requestId),
  };

  private onReady(): void {
    this.ready = true;
    this.ensureEditorSettingsSubscription();
    const layout = this.layoutStore.load();
    if (layout) {
      this.trackLayoutNodes(layout);
    }
    const theme = this.getThemeService().resolve();
    this.post({
      type: "init",
      layout,
      settings: this.readSettings(),
      theme,
      editorSettings: this.readEditorSettings(),
      savedLayouts: this.toSavedLayoutSummaries(),
      referenceClickMode: this.readReferenceClickMode(),
    });
    for (const run of this.pendingOpens.splice(0)) run();
  }

  private async onOpenFile(
    msg: Extract<WebviewMessage, { type: "openFile" }>,
  ): Promise<void> {
    const uri = this.parseRequestUri(msg.fileUri, "open file");
    const payload = await this.makeNodePayload(uri, msg.revealRange);
    this.post({ type: "openFileResult", requestId: msg.requestId, ...payload });
    this.getDocumentSync().watch(uri);
  }

  private async onRequestDefinition(
    msg: Extract<WebviewMessage, { type: "requestDefinition" }>,
  ): Promise<void> {
    const uri = this.parseRequestUri(msg.fileUri, "resolve definition");
    this.assertTrackedDocument(uri, "resolve definition");
    const locations = await this.getLanguage().getDefinitions(
      uri,
      new vscode.Position(msg.line, msg.character),
    );
    this.post({
      type: "definitionResult",
      requestId: msg.requestId,
      sourceNodeId: msg.sourceNodeId,
      locations,
    });
  }

  private async onRequestReferences(
    msg: Extract<WebviewMessage, { type: "requestReferences" }>,
  ): Promise<void> {
    const uri = this.parseRequestUri(msg.fileUri, "resolve references");
    this.assertTrackedDocument(uri, "resolve references");
    const locations = await this.getLanguage().getReferences(
      uri,
      new vscode.Position(msg.line, msg.character),
    );
    this.post({
      type: "referencesResult",
      requestId: msg.requestId,
      sourceNodeId: msg.sourceNodeId,
      locations,
    });
  }

  private async onApplyEdit(
    msg: Extract<WebviewMessage, { type: "applyEdit" }>,
  ): Promise<void> {
    this.assertWorkspaceTrusted("apply edits");
    const uri = this.parseRequestUri(msg.uri, "apply edit");
    this.assertWritableUri(uri, "apply edit");
    this.assertTrackedDocument(uri, "apply edit");
    await this.getDocumentSync().applyFullText(uri, msg.text);
  }

  private async onApplyDelta(
    msg: Extract<WebviewMessage, { type: "applyDelta" }>,
  ): Promise<void> {
    this.assertWorkspaceTrusted("apply edits");
    const uri = this.parseRequestUri(msg.uri, "apply delta");
    this.assertWritableUri(uri, "apply delta");
    this.assertTrackedDocument(uri, "apply delta");
    await this.getDocumentSync().applyDelta(uri, msg.changes);
  }

  private async onRevealInWorkbench(
    msg: Extract<WebviewMessage, { type: "revealInWorkbench" }>,
  ): Promise<void> {
    const uri = this.parseRequestUri(msg.fileUri, "reveal in workbench");
    this.assertTrackedDocument(uri, "reveal in workbench");
    const doc = await vscode.workspace.openTextDocument(uri);
    const ed = await vscode.window.showTextDocument(doc, {
      preview: false,
      viewColumn: vscode.ViewColumn.Beside,
    });
    if (!msg.range) return;
    const r = new vscode.Range(
      msg.range.startLine,
      msg.range.startCharacter,
      msg.range.endLine,
      msg.range.endCharacter,
    );
    ed.revealRange(r, vscode.TextEditorRevealType.InCenter);
    ed.selection = new vscode.Selection(r.start, r.end);
  }

  private async makeNodePayload(
    uri: vscode.Uri,
    revealRange?: RangeLike,
  ): Promise<{
    node: CanvasNode;
    content: string;
    languageId: string;
    isDirty: boolean;
  }> {
    const doc = await vscode.workspace.openTextDocument(uri);
    const settings = this.readSettings();
    const node: CanvasNode = {
      id: randomUUID(),
      fileUri: uri.toString(),
      x: 0,
      y: 0,
      width: settings.defaultWidth,
      height: settings.defaultHeight,
      revealRange,
    };
    return {
      node,
      content: doc.getText(),
      languageId: doc.languageId,
      isDirty: doc.isDirty,
    };
  }

  private makeNodePayloadSync(uri: vscode.Uri, revealRange?: RangeLike) {
    // Best-effort sync read for command-driven opens before the webview has booted.
    const settings = this.readSettings();
    let content = "";
    let languageId = "plaintext";
    let isDirty = false;
    const liveDoc = vscode.workspace.textDocuments.find(
      (doc) => doc.uri.toString() === uri.toString(),
    );
    if (liveDoc) {
      content = liveDoc.getText();
      languageId = liveDoc.languageId;
      isDirty = liveDoc.isDirty;
    } else {
      try {
        content = fs.readFileSync(uri.fsPath, "utf8");
        languageId = guessLanguage(uri.fsPath);
      } catch {
        // ignore — webview will request the file properly once ready
      }
    }
    const node: CanvasNode = {
      id: randomUUID(),
      fileUri: uri.toString(),
      x: 0,
      y: 0,
      width: settings.defaultWidth,
      height: settings.defaultHeight,
      revealRange,
    };
    return { node, content, languageId, isDirty };
  }

  private readSettings(): CanvasSettings {
    const cfg = vscode.workspace.getConfiguration("wanderer");
    return {
      horizontalGap: cfg.get<number>("spatial.horizontalGap", 120),
      verticalStack: cfg.get<number>("spatial.verticalStack", 40),
      defaultWidth: cfg.get<number>("node.defaultWidth", 520),
      defaultHeight: cfg.get<number>("node.defaultHeight", 360),
    };
  }

  private readEditorSettings(): EditorSettings {
    const cfg = vscode.workspace.getConfiguration("editor");
    const wandererCfg = vscode.workspace.getConfiguration("wanderer");

    const minimapEnabled = wandererCfg.get<boolean>(
      "webview.editor.minimap.enabled",
      false,
    );
    const bracketPairColorizationOverride = wandererCfg.get<boolean | null>(
      "webview.editor.bracketPairColorization.enabled",
      null,
    );
    const bracketPairColorizationEnabled =
      bracketPairColorizationOverride ??
      cfg.get<boolean>("bracketPairColorization.enabled", false);

    return {
      fontSize: cfg.get<number>("fontSize", 14),
      fontFamily: cfg.get<string>(
        "fontFamily",
        "'Droid Sans Mono', 'monospace'",
      ),
      fontLigatures: cfg.get<boolean>("fontLigatures", false),
      lineHeight: cfg.get<number>("lineHeight", 0),
      tabSize: cfg.get<number>("tabSize", 4),
      insertSpaces: cfg.get<boolean>("insertSpaces", true),
      wordWrap: cfg.get<"off" | "on" | "wordWrapColumn" | "bounded">(
        "wordWrap",
        "off",
      ),
      wordWrapColumn: cfg.get<number>("wordWrapColumn", 80),
      minimap: minimapEnabled,
      renderWhitespace: cfg.get<EditorSettings["renderWhitespace"]>(
        "renderWhitespace",
        "selection",
      ),
      cursorStyle: cfg.get<string>("cursorStyle", "line"),
      cursorBlinking: cfg.get<string>("cursorBlinking", "blink"),
      smoothScrolling: cfg.get<boolean>("smoothScrolling", false),
      bracketPairColorization: bracketPairColorizationEnabled,
      bracketPairColorizationIndependentColorPoolPerBracketType:
        cfg.get<boolean>(
          "bracketPairColorization.independentColorPoolPerBracketType",
          false,
        ),
      guides: {
        bracketPairs: cfg.get<boolean | "active">("guides.bracketPairs", false),
        indentation: cfg.get<boolean>("guides.indentation", true),
        highlightActiveIndentation: cfg.get<boolean | "always">(
          "guides.highlightActiveIndentation",
          true,
        ),
      },
      linkedEditing: cfg.get<boolean>("linkedEditing", false),
      formatOnPaste: cfg.get<boolean>("formatOnPaste", false),
      formatOnType: cfg.get<boolean>("formatOnType", false),
      stickyScroll: cfg.get<boolean>("stickyScroll.enabled", false),
      renderLineHighlight: cfg.get<EditorSettings["renderLineHighlight"]>(
        "renderLineHighlight",
        "line",
      ),
    };
  }

  private async onRequestSaveNamedLayout(): Promise<void> {
    const name = await vscode.window.showInputBox({
      prompt: "Layout name",
      placeHolder: "e.g. Auth flow, Main architecture…",
      validateInput: (v) =>
        v.trim().length === 0 ? "Name cannot be empty" : undefined,
    });
    if (!name) return;
    this.saveNamedLayout(name.trim());
  }

  private async onRequestLoadNamedLayout(): Promise<void> {
    const layouts = this.layoutStore.list();
    if (layouts.length === 0) {
      vscode.window.showInformationMessage("Wanderer: no saved layouts yet.");
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
    this.layoutStore.markOpened(pick.layout.name);
    this.loadSnapshot(pick.layout.snapshot);
  }

  private onLoadNamedLayout(
    msg: Extract<WebviewMessage, { type: "loadNamedLayout" }>,
  ): void {
    const saved = this.layoutStore.get(msg.name);
    if (!saved) {
      vscode.window.showWarningMessage(
        `Wanderer: layout "${msg.name}" not found.`,
      );
      return;
    }
    this.layoutStore.markOpened(saved.name);
    this.loadSnapshot(saved.snapshot);
  }

  private onSetReferenceClickMode(
    msg: Extract<WebviewMessage, { type: "setReferenceClickMode" }>,
  ): void {
    void this.context.workspaceState.update(REFERENCE_CLICK_MODE_KEY, msg.mode);
  }

  private onRequestCloseCanvasTab(): void {
    this.panel.dispose();
  }

  private async onRequestOpenDialog(
    msg: Extract<WebviewMessage, { type: "requestOpenDialog" }>,
  ): Promise<void> {
    const options = msg.options ?? {};
    const allowMultiSelect = options.allowMultiSelect === true;
    const pathFirst = options.pathFirst === true;
    const recent = this.readRecentFiles();
    const recentRank = new Map(recent.map((uri, idx) => [uri, idx]));

    type OpenDialogItem = {
      label: string;
      description: string;
      detail?: string;
      uri: vscode.Uri;
      sortKey: string;
      recentIndex: number;
    };

    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    let items: OpenDialogItem[];

    const makeItem = (
      relativePath: string,
      uri: vscode.Uri,
    ): OpenDialogItem => {
      const recentIndex =
        recentRank.get(uri.toString()) ?? Number.POSITIVE_INFINITY;
      const label = pathFirst ? relativePath : path.basename(relativePath);
      const description = pathFirst
        ? path.basename(relativePath)
        : relativePath;
      const detail = Number.isFinite(recentIndex)
        ? `Recent ${recentIndex + 1}`
        : undefined;
      return {
        label,
        description,
        detail,
        uri,
        sortKey: relativePath,
        recentIndex,
      };
    };

    if (root) {
      try {
        // Use git to list tracked + untracked-but-not-ignored files.
        const output = execFileSync(
          "git",
          ["ls-files", "--cached", "--others", "--exclude-standard"],
          { cwd: root, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
        );
        const files = output.trim().split("\n").filter(Boolean);
        items = files.map((rel) =>
          makeItem(rel, vscode.Uri.file(path.join(root, rel))),
        );
      } catch {
        // Fallback: not a git repo or git unavailable.
        const uris = await vscode.workspace.findFiles("**/*", undefined, 5000);
        items = uris.map((f) =>
          makeItem(vscode.workspace.asRelativePath(f, false), f),
        );
      }
    } else {
      const uris = await vscode.workspace.findFiles("**/*", undefined, 5000);
      items = uris.map((f) =>
        makeItem(vscode.workspace.asRelativePath(f, false), f),
      );
    }

    items.sort((a, b) => {
      if (a.recentIndex !== b.recentIndex) {
        if (Number.isFinite(a.recentIndex) && Number.isFinite(b.recentIndex)) {
          return a.recentIndex - b.recentIndex;
        }
        return Number.isFinite(a.recentIndex) ? -1 : 1;
      }
      return a.sortKey.localeCompare(b.sortKey);
    });

    if (allowMultiSelect) {
      const picks = await vscode.window.showQuickPick(items, {
        placeHolder: "Select files to open on the canvas",
        matchOnDescription: true,
        matchOnDetail: true,
        canPickMany: true,
      });
      if (!picks || picks.length === 0) return;
      const selectedUris = dedupeUris(picks.map((pick) => pick.uri));
      for (const uri of selectedUris) {
        this.openFileOnCanvas(uri);
      }
      await this.writeRecentFiles(selectedUris);
      return;
    }

    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: "Select a file to open on the canvas",
      matchOnDescription: true,
      matchOnDetail: true,
    });
    if (!pick) return;
    this.openFileOnCanvas(pick.uri);
    await this.writeRecentFiles([pick.uri]);
  }

  private readRecentFiles(): string[] {
    return this.context.workspaceState.get<string[]>(RECENT_FILES_KEY) ?? [];
  }

  private async writeRecentFiles(uris: vscode.Uri[]): Promise<void> {
    if (uris.length === 0) return;
    const seen = new Set<string>();
    const next: string[] = [];

    for (const uri of uris) {
      const key = uri.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      next.push(key);
    }
    for (const key of this.readRecentFiles()) {
      if (seen.has(key)) continue;
      seen.add(key);
      next.push(key);
      if (next.length >= MAX_RECENT_FILES) break;
    }

    await this.context.workspaceState.update(
      RECENT_FILES_KEY,
      next.slice(0, MAX_RECENT_FILES),
    );
  }

  private async onRequestHover(msg: {
    requestId: string;
    fileUri: string;
    line: number;
    character: number;
  }): Promise<void> {
    const uri = this.parseRequestUri(msg.fileUri, "resolve hover");
    this.assertTrackedDocument(uri, "resolve hover");
    const pos = new vscode.Position(msg.line, msg.character);
    const contents = await this.getLanguage().getHover(uri, pos);
    this.post({
      type: "hoverResult",
      requestId: msg.requestId,
      contents,
    });
  }

  private async onRequestCompletion(
    msg: Extract<WebviewMessage, { type: "requestCompletion" }>,
  ): Promise<void> {
    const uri = this.parseRequestUri(msg.fileUri, "resolve completion");
    this.assertTrackedDocument(uri, "resolve completion");
    const pos = new vscode.Position(msg.line, msg.character);
    const completionList = await this.getLanguage().getCompletions(
      uri,
      pos,
      msg.triggerCharacter,
    );
    this.post({
      type: "completionResult",
      requestId: msg.requestId,
      items: completionList.items,
      isIncomplete: completionList.isIncomplete,
    });
  }

  private async onRequestFormat(msg: {
    requestId: string;
    fileUri: string;
  }): Promise<void> {
    const uri = this.parseRequestUri(msg.fileUri, "format document");
    this.assertTrackedDocument(uri, "format document");
    const edits = await this.getLanguage().formatDocument(uri);
    this.post({
      type: "formatResult",
      requestId: msg.requestId,
      edits,
    });
  }

  private async onRequestSaveDocument(msg: { fileUri: string }): Promise<void> {
    this.assertWorkspaceTrusted("save documents");
    const uri = this.parseRequestUri(msg.fileUri, "save document");
    this.assertWritableUri(uri, "save document");
    this.assertTrackedDocument(uri, "save document");
    const saved = await this.getDocumentSync().save(uri);
    if (!saved) {
      throw new Error(`Failed to save ${uri.fsPath}`);
    }
  }

  private async onRequestInlineCompletion(msg: {
    requestId: string;
    fileUri: string;
    line: number;
    character: number;
    textBeforeCursor: string;
    textAfterCursor: string;
    languageId: string;
  }): Promise<void> {
    this.assertWorkspaceTrusted("request AI completions");
    const uri = this.parseRequestUri(msg.fileUri, "inline completion");
    this.assertTrackedDocument(uri, "inline completion");
    const copilot = this.getCopilotService();
    const items = await copilot.getInlineCompletions(
      msg.requestId,
      msg.fileUri,
      msg.line,
      msg.character,
      msg.textBeforeCursor,
      msg.textAfterCursor,
      msg.languageId,
    );
    this.post({
      type: "inlineCompletionResult",
      requestId: msg.requestId,
      items,
    });
  }

  private async onRequestInlineChat(msg: {
    requestId: string;
    fileUri: string;
    prompt: string;
    selectedText: string;
    fullText: string;
    line: number;
    character: number;
    languageId: string;
  }): Promise<void> {
    this.assertWorkspaceTrusted("run inline chat");
    const uri = this.parseRequestUri(msg.fileUri, "inline chat");
    this.assertTrackedDocument(uri, "inline chat");
    const copilot = this.getCopilotService();
    for await (const event of copilot.runInlineChat(
      msg.requestId,
      msg.fileUri,
      msg.prompt,
      msg.selectedText,
      msg.fullText,
      msg.line,
      msg.character,
      msg.languageId,
    )) {
      switch (event.type) {
        case "chunk":
          this.post({
            type: "inlineChatChunk",
            requestId: msg.requestId,
            text: event.text,
          });
          break;
        case "done":
          this.post({
            type: "inlineChatResult",
            requestId: msg.requestId,
            text: event.text,
          });
          break;
        case "error":
          this.post({
            type: "inlineChatError",
            requestId: msg.requestId,
            message: event.message,
          });
          break;
      }
    }
  }

  private onDiagnosticsChanged(e: vscode.DiagnosticChangeEvent): void {
    const docs = this.docs;
    if (!docs) return;
    for (const uri of e.uris) {
      // Only forward diagnostics for documents the webview is tracking.
      if (!docs.isTracked(uri)) continue;
      const diagnostics = vscode.languages.getDiagnostics(uri);
      const markers: DiagnosticData[] = diagnostics.map((d) => ({
        startLine: d.range.start.line,
        startCharacter: d.range.start.character,
        endLine: d.range.end.line,
        endCharacter: d.range.end.character,
        message: d.message,
        severity: mapSeverity(d.severity),
        source: d.source,
        code:
          typeof d.code === "object"
            ? String(d.code.value)
            : d.code !== undefined
              ? String(d.code)
              : undefined,
      }));
      this.post({ type: "diagnostics", uri: uri.toString(), markers });
    }
  }

  private renderHtml(): string {
    const distRoot = vscode.Uri.joinPath(
      this.context.extensionUri,
      "webview",
      "dist",
    );
    const indexPath = path.join(distRoot.fsPath, "index.html");
    if (!fs.existsSync(indexPath)) {
      return fallbackHtml();
    }
    const raw = fs.readFileSync(indexPath, "utf8");
    const nonce = randomUUID().replace(/-/g, "");
    const webview = this.panel.webview;

    // Preload heavy assets (wasm, worker scripts) so the browser cache is
    // warm when the TextMate service requests them.
    const assetsDir = path.join(distRoot.fsPath, "assets");
    let preloadTags = "";
    if (fs.existsSync(assetsDir)) {
      for (const file of fs.readdirSync(assetsDir)) {
        if (file.endsWith(".wasm")) {
          const uri = webview.asWebviewUri(
            vscode.Uri.joinPath(distRoot, "assets", file),
          );
          preloadTags += `\n          <link rel="preload" href="${uri}" as="fetch" crossorigin="anonymous">`;
        } else if (/^(editor\.)?worker.*\.js$/.test(file)) {
          const uri = webview.asWebviewUri(
            vscode.Uri.joinPath(distRoot, "assets", file),
          );
          preloadTags += `\n          <link rel="modulepreload" href="${uri}">`;
        }
      }
    }

    // Rewrite asset URLs produced by Vite (both "/path" and "./path") to webview URIs.
    const html = raw
      .replace(
        /(src|href)="(?:\.?\/)?([^"]+)"/g,
        (_: any, attr: any, p: string) => {
          const uri = webview.asWebviewUri(vscode.Uri.joinPath(distRoot, p));
          return `${attr}="${uri.toString()}"`;
        },
      )
      .replace(/<script /g, `<script nonce="${nonce}" `)
      .replace(
        /<head>/,
        `<head>
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource} data:; script-src ${webview.cspSource} 'nonce-${nonce}' 'wasm-unsafe-eval'; worker-src ${webview.cspSource} blob:; connect-src ${webview.cspSource};">${preloadTags}`,
      );
    return html;
  }

  private parseRequestUri(raw: string, operation: string): vscode.Uri {
    let uri: vscode.Uri;
    try {
      uri = vscode.Uri.parse(raw, true);
    } catch {
      throw new Error(`Invalid URI for ${operation}.`);
    }

    this.assertAllowedUri(uri, operation);
    return uri;
  }

  private assertAllowedUri(uri: vscode.Uri, operation: string): void {
    const scheme = uri.scheme.toLowerCase();
    if (!scheme || BLOCKED_URI_SCHEMES.has(scheme)) {
      throw new Error(`Unsupported URI scheme for ${operation}.`);
    }
  }

  private assertWritableUri(uri: vscode.Uri, operation: string): void {
    if (!WRITABLE_URI_SCHEMES.has(uri.scheme.toLowerCase())) {
      throw new Error(`Refusing ${operation} for read-only URI scheme.`);
    }
  }

  private assertWorkspaceTrusted(operation: string): void {
    if (vscode.workspace.isTrusted) return;
    throw new Error(`Wanderer requires a trusted workspace to ${operation}.`);
  }

  private assertTrackedDocument(uri: vscode.Uri, operation: string): void {
    const docs = this.getDocumentSync();
    if (!docs.isTracked(uri)) {
      throw new Error(`Refusing ${operation} for an untracked document.`);
    }
  }

  private trackLayoutNodes(layout: GraphSnapshot): void {
    const docs = this.getDocumentSync();
    for (const node of layout.nodes) {
      try {
        const uri = this.parseRequestUri(node.fileUri, "restore layout");
        docs.watch(uri);
      } catch {
        // Skip unsupported URIs saved by older versions.
      }
    }
  }

  private toSavedLayoutSummaries(): SavedLayoutSummary[] {
    return this.layoutStore.list().map((layout) => ({
      name: layout.name,
      nodeCount: layout.snapshot.nodes.length,
      savedAt: layout.savedAt,
      updatedAt: layout.updatedAt,
      lastOpenedAt: layout.lastOpenedAt,
      isPinned: layout.isPinned === true,
    }));
  }

  private readReferenceClickMode(): ReferenceClickMode {
    const value = this.context.workspaceState.get<unknown>(
      REFERENCE_CLICK_MODE_KEY,
    );
    if (typeof value === "string" && REFERENCE_CLICK_MODE_SET.has(value)) {
      return value as ReferenceClickMode;
    }
    return DEFAULT_REFERENCE_CLICK_MODE;
  }
}

function fallbackHtml(): string {
  return `<!doctype html><html><body style="font-family:sans-serif;padding:24px;color:#ddd;background:#1e1e1e">
  <h2>Wanderer</h2>
  <p>The webview bundle has not been built yet.</p>
  <pre>npm install &amp;&amp; npm run build</pre>
  </body></html>`;
}

const LANGUAGE_BY_EXT: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescriptreact",
  ".js": "javascript",
  ".jsx": "javascriptreact",
  ".json": "json",
  ".md": "markdown",
  ".css": "css",
  ".html": "html",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".php": "php",
};

function guessLanguage(filePath: string): string {
  return LANGUAGE_BY_EXT[path.extname(filePath).toLowerCase()] ?? "plaintext";
}

function logFromWebview(
  level: "info" | "warn" | "error",
  message: string,
): void {
  const fn =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;
  fn("[Wanderer webview]", message);
}

function mapSeverity(s: vscode.DiagnosticSeverity): number {
  // Monaco MarkerSeverity: 1=Hint, 2=Info, 4=Warning, 8=Error
  switch (s) {
    case vscode.DiagnosticSeverity.Error:
      return 8;
    case vscode.DiagnosticSeverity.Warning:
      return 4;
    case vscode.DiagnosticSeverity.Information:
      return 2;
    case vscode.DiagnosticSeverity.Hint:
      return 1;
  }
}

function dedupeUris(uris: vscode.Uri[]): vscode.Uri[] {
  const seen = new Set<string>();
  const out: vscode.Uri[] = [];
  for (const uri of uris) {
    const key = uri.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(uri);
  }
  return out;
}

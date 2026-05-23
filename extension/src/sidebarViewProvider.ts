import * as vscode from "vscode";
import { randomUUID } from "node:crypto";

export interface SidebarViewProviderHandlers {
  openCanvas: () => void | Promise<void>;
  openCurrentFileOnCanvas: () => void | Promise<void>;
}

/**
 * Sidebar webview view that lives behind the activity-bar icon.
 * When revealed it shows a lightweight launcher; the "Open Canvas" button
 * opens the full-size panel in the editor area.
 */
export class SidebarViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "wanderer.sidebarCanvas";

  constructor(private readonly handlers: SidebarViewProviderHandlers) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _ctx: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [],
    };
    webviewView.webview.html = this.html(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg: unknown) => {
      if (!isSidebarCommandMessage(msg)) return;
      if (msg.command === "openCanvas") {
        void this.handlers.openCanvas();
      } else if (msg.command === "openCurrentFile") {
        void this.handlers.openCurrentFileOnCanvas();
      }
    });
  }

  private html(webview: vscode.Webview): string {
    const nonce = randomUUID().replace(/-/g, "");
    return /* html */ `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <style>
    body {
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 16px;
      margin: 0;
    }
    h3 { margin: 0 0 12px; font-weight: 500; font-size: 13px; }
    p  { margin: 0 0 16px; font-size: 12px; color: var(--vscode-descriptionForeground); }
    button {
      display: block;
      width: 100%;
      padding: 8px 12px;
      margin-bottom: 8px;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  </style>
</head>
<body>
  <h3>Wanderer</h3>
  <p>Navigate your codebase spatially on an infinite canvas.</p>
  <button id="open-canvas">Open Canvas</button>
  <button id="open-current-file" class="secondary">Open Current File on Canvas</button>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document
      .getElementById('open-canvas')
      ?.addEventListener('click', () => vscode.postMessage({ command: 'openCanvas' }));
    document
      .getElementById('open-current-file')
      ?.addEventListener('click', () => vscode.postMessage({ command: 'openCurrentFile' }));
  </script>
</body>
</html>`;
  }
}

function isSidebarCommandMessage(
  value: unknown,
): value is { command: "openCanvas" | "openCurrentFile" } {
  if (typeof value !== "object" || value === null) return false;
  const command = (value as { command?: unknown }).command;
  return command === "openCanvas" || command === "openCurrentFile";
}

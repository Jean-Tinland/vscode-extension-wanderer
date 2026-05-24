import * as vscode from "vscode";

export interface SidebarViewProviderHandlers {
  openCanvas: () => void | Promise<void>;
}

/**
 * Activity-bar bridge view.
 *
 * The view itself is intentionally minimal: whenever it becomes visible,
 * it immediately opens the full canvas panel and closes the sidebar so
 * clicking the activity icon behaves like a direct "Open Canvas" action.
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
      enableScripts: false,
      localResourceRoots: [],
    };
    webviewView.webview.html = this.html(webviewView.webview);

    let opening = false;
    const openCanvasFromActivity = () => {
      if (!webviewView.visible || opening) return;
      opening = true;
      void Promise.resolve(this.handlers.openCanvas())
        .then(() =>
          vscode.commands.executeCommand("workbench.action.closeSidebar"),
        )
        .finally(() => {
          opening = false;
        });
    };

    openCanvasFromActivity();
    webviewView.onDidChangeVisibility(() => {
      openCanvasFromActivity();
    });
  }

  private html(webview: vscode.Webview): string {
    return /* html */ `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline';">
  <style>
    body {
      margin: 0;
      padding: 12px;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-sideBar-background);
      font: 12px/1.4 var(--vscode-font-family, system-ui, sans-serif);
    }
  </style>
</head>
<body>
  Opening Wanderer canvas...
</body>
</html>`;
  }
}

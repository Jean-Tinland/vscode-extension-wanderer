const VSCODE_TO_MONACO_LANGUAGE: Record<string, string> = {
  javascriptreact: "jsx",
  typescriptreact: "tsx",
};

/**
 * Normalize VS Code language ids to the Monaco ids used in the webview.
 * TSX/JSX need dedicated ids so tokenization uses the correct JSX grammars.
 */
export function toMonacoLanguageId(languageId: string): string {
  return VSCODE_TO_MONACO_LANGUAGE[languageId] ?? languageId;
}
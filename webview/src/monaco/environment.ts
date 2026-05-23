import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { ensureShikiTokenizationReady } from "./shikiTokenization";

let configurePromise: Promise<void> | null = null;

function ensureLanguageRegistration(id: string): void {
  const exists = monaco.languages.getLanguages().some((lang) => lang.id === id);
  if (!exists) {
    monaco.languages.register({ id });
  }
}

function disableBuiltInLanguageServices(): void {
  type MonacoLanguageDefaults = {
    setDiagnosticsOptions?: (options: unknown) => void;
    setModeConfiguration?: (options: unknown) => void;
    setEagerModelSync?: (value: boolean) => void;
  };

  const languageDefaults = monaco.languages as unknown as {
    typescript?: {
      typescriptDefaults?: MonacoLanguageDefaults;
      javascriptDefaults?: MonacoLanguageDefaults;
    };
    json?: {
      jsonDefaults?: MonacoLanguageDefaults;
    };
    css?: {
      cssDefaults?: MonacoLanguageDefaults;
      scssDefaults?: MonacoLanguageDefaults;
      lessDefaults?: MonacoLanguageDefaults;
    };
    html?: {
      htmlDefaults?: MonacoLanguageDefaults;
      handlebarDefaults?: MonacoLanguageDefaults;
      razorDefaults?: MonacoLanguageDefaults;
    };
  };

  const modeConfiguration = {
    completionItems: false,
    hovers: false,
    documentSymbols: false,
    definitions: false,
    references: false,
    documentHighlights: false,
    rename: false,
    diagnostics: false,
    documentFormattingEdits: false,
    documentRangeFormattingEdits: false,
    signatureHelp: false,
    onTypeFormattingEdits: false,
    codeActions: false,
    inlayHints: false,
    semanticTokens: false,
    colors: false,
    foldingRanges: false,
    selectionRanges: false,
  };

  const disableDefaults = (defaults?: MonacoLanguageDefaults) => {
    if (!defaults) return;
    defaults.setDiagnosticsOptions?.({
      validate: false,
      noSemanticValidation: true,
      noSyntaxValidation: true,
      noSuggestionDiagnostics: true,
      enableSchemaRequest: false,
      lint: {
        compatibleVendorPrefixes: "ignore",
        vendorPrefix: "ignore",
      },
    });
    defaults.setModeConfiguration?.(modeConfiguration);
    defaults.setEagerModelSync?.(false);
  };

  disableDefaults(languageDefaults.typescript?.typescriptDefaults);
  disableDefaults(languageDefaults.typescript?.javascriptDefaults);
  disableDefaults(languageDefaults.json?.jsonDefaults);
  disableDefaults(languageDefaults.css?.cssDefaults);
  disableDefaults(languageDefaults.css?.scssDefaults);
  disableDefaults(languageDefaults.css?.lessDefaults);
  disableDefaults(languageDefaults.html?.htmlDefaults);
  disableDefaults(languageDefaults.html?.handlebarDefaults);
  disableDefaults(languageDefaults.html?.razorDefaults);
}

/**
 * Wire Monaco workers as Vite-bundled web workers so the editor runs entirely
 * offline inside the webview (no CDN, CSP-friendly). Must complete before the
 * first editor is mounted.
 */
export async function configureMonacoEnvironment(): Promise<void> {
  if (configurePromise) {
    await configurePromise;
    return;
  }

  configurePromise = (async () => {
    (
      self as unknown as { MonacoEnvironment: monaco.Environment }
    ).MonacoEnvironment = {
      getWorker() {
        return new editorWorker();
      },
    };

    disableBuiltInLanguageServices();
    ensureLanguageRegistration("tsx");
    ensureLanguageRegistration("jsx");

    loader.config({ monaco });

    await ensureShikiTokenizationReady();
  })();

  try {
    await configurePromise;
  } catch (error) {
    configurePromise = null;
    throw error;
  }
}

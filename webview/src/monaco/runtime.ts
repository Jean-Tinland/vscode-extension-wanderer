import type { MonacoThemeData } from "@shared/protocol";

let runtimePromise: Promise<void> | null = null;
let applyTheme: ((theme: MonacoThemeData) => void) | null = null;
let latestTheme: MonacoThemeData | null = null;
let diagnosticsInitialized = false;

export function queueMonacoTheme(theme: MonacoThemeData): void {
  latestTheme = theme;
  if (applyTheme) {
    applyTheme(theme);
  }
}

export function ensureMonacoRuntime(): Promise<void> {
  if (runtimePromise) {
    return runtimePromise;
  }

  runtimePromise = (async () => {
    const { configureMonacoEnvironment } = await import("./environment");
    await configureMonacoEnvironment();

    if (!diagnosticsInitialized) {
      const { initDiagnosticsListener } = await import("./diagnostics");
      initDiagnosticsListener();
      diagnosticsInitialized = true;
    }

    const { setTheme } = await import("./themeManager");
    applyTheme = setTheme;

    if (latestTheme) {
      setTheme(latestTheme);
    }
  })();

  runtimePromise.catch((error) => {
    console.warn("[wanderer] Failed to initialize Monaco runtime", error);
    runtimePromise = null;
  });

  return runtimePromise;
}

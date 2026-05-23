import * as monaco from "monaco-editor";
import { shikiToMonaco } from "@shikijs/monaco";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import langTypeScript from "shiki/langs/typescript.mjs";
import langTsx from "shiki/langs/tsx.mjs";
import langJavaScript from "shiki/langs/javascript.mjs";
import langJsx from "shiki/langs/jsx.mjs";
import langJson from "shiki/langs/json.mjs";
import langMarkdown from "shiki/langs/markdown.mjs";
import langCss from "shiki/langs/css.mjs";
import langHtml from "shiki/langs/html.mjs";
import langPython from "shiki/langs/python.mjs";
import langRust from "shiki/langs/rust.mjs";
import langGo from "shiki/langs/go.mjs";
import langPhp from "shiki/langs/php.mjs";
import type { MonacoThemeData } from "@shared/protocol";

const SHIKI_THEME_NAME = "wanderer-host";

const SHIKI_LANGS = [
  langTypeScript,
  langTsx,
  langJavaScript,
  langJsx,
  langJson,
  langMarkdown,
  langCss,
  langHtml,
  langPython,
  langRust,
  langGo,
  langPhp,
] as const;

let readyPromise: Promise<void> | null = null;
let highlighter: Awaited<ReturnType<typeof createHighlighterCore>> | null =
  null;

const baseSetTheme = monaco.editor.setTheme.bind(monaco.editor);
const baseCreateEditor = monaco.editor.create.bind(monaco.editor);

export async function ensureShikiTokenizationReady(): Promise<void> {
  if (readyPromise) {
    await readyPromise;
    return;
  }

  readyPromise = initializeWithTheme(fallbackThemeData());

  try {
    await readyPromise;
  } catch (error) {
    readyPromise = null;
    highlighter = null;
    console.warn("[wanderer] Failed to initialize Shiki tokenization", error);
  }
}

export async function applyShikiTheme(theme: MonacoThemeData): Promise<void> {
  await ensureShikiTokenizationReady();

  try {
    await initializeWithTheme(theme);
  } catch (error) {
    console.warn("[wanderer] Failed to apply Shiki theme", error);
  }
}

async function initializeWithTheme(theme: MonacoThemeData): Promise<void> {
  highlighter?.dispose();

  highlighter = await createHighlighterCore({
    engine: createJavaScriptRegexEngine(),
    themes: [buildShikiTheme(theme)],
    langs: [...SHIKI_LANGS],
    warnings: false,
  });

  // Reset previously patched Monaco methods before re-binding.
  monaco.editor.setTheme = baseSetTheme;
  monaco.editor.create = baseCreateEditor;
  shikiToMonaco(highlighter, monaco);

  // Keep runtime theme id consistent with EditorNode's configured theme.
  monaco.editor.setTheme(SHIKI_THEME_NAME);
}

function buildShikiTheme(theme: MonacoThemeData): {
  name: string;
  type: "light" | "dark";
  fg: string;
  bg: string;
  colors: Record<string, string>;
  settings: Array<{
    scope?: string;
    settings: {
      foreground?: string;
      background?: string;
      fontStyle?: string;
    };
  }>;
  semanticHighlighting: true;
} {
  const light = theme.base === "vs" || theme.base === "hc-light";
  const fallbackFg = light ? "#1f1f1f" : "#d4d4d4";
  const fallbackBg = light ? "#ffffff" : "#1e1e1e";

  const settings = theme.rules.flatMap((rule) => {
    const foreground = toHexWithHash(rule.foreground);
    const background = toHexWithHash(rule.background);
    const fontStyle = normalizeFontStyleString(rule.fontStyle);

    if (!foreground && !background && !fontStyle) {
      return [];
    }

    const item: {
      scope?: string;
      settings: {
        foreground?: string;
        background?: string;
        fontStyle?: string;
      };
    } = {
      settings: {
        foreground,
        background,
        fontStyle: fontStyle || undefined,
      },
    };

    if (rule.token.trim()) {
      item.scope = rule.token.trim();
    }

    return [item];
  });

  return {
    name: SHIKI_THEME_NAME,
    type: light ? "light" : "dark",
    fg: toHexWithHash(theme.colors["editor.foreground"]) ?? fallbackFg,
    bg: toHexWithHash(theme.colors["editor.background"]) ?? fallbackBg,
    colors: normalizeColorMap(theme.colors),
    settings,
    semanticHighlighting: true,
  };
}

function normalizeColorMap(
  colors: Record<string, string>,
): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(colors)) {
    const color = toHexWithHash(value);
    if (!color) continue;
    normalized[key] = color;
  }
  return normalized;
}

function fallbackThemeData(): MonacoThemeData {
  const base = detectBaseThemeName();
  const light = base === "vs" || base === "hc-light";
  return {
    base,
    inherit: true,
    rules: [],
    colors: {
      "editor.background": light ? "#ffffff" : "#1e1e1e",
      "editor.foreground": light ? "#1f1f1f" : "#d4d4d4",
    },
  };
}

function detectBaseThemeName(): MonacoThemeData["base"] {
  const kind = document.body.dataset.vscodeThemeKind;
  switch (kind) {
    case "vscode-light":
      return "vs";
    case "vscode-high-contrast":
      return "hc-black";
    case "vscode-high-contrast-light":
      return "hc-light";
    default:
      return "vs-dark";
  }
}

function normalizeColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let normalized = value.trim().toLowerCase();
  if (normalized.startsWith("#")) {
    normalized = normalized.slice(1);
  }
  if (![3, 4, 6, 8].includes(normalized.length)) {
    return undefined;
  }
  if (!/^[\da-f]+$/i.test(normalized)) {
    return undefined;
  }
  if (normalized.length === 3 || normalized.length === 4) {
    normalized = normalized
      .split("")
      .map((part) => `${part}${part}`)
      .join("");
  }
  return normalized;
}

function toHexWithHash(value: string | undefined): string | undefined {
  const normalized = normalizeColor(value);
  if (!normalized) return undefined;
  return `#${normalized}`;
}

const VALID_FONT_STYLES = new Set([
  "italic",
  "bold",
  "underline",
  "strikethrough",
]);

const FONT_STYLE_ALIASES: Record<string, string> = {
  "line-through": "strikethrough",
};

function normalizeFontStyleString(fontStyle: string | undefined): string {
  if (!fontStyle) return "";
  const styles = fontStyle
    .split(/[\s,]+/)
    .map((item) => item.trim().toLowerCase())
    .map((item) => FONT_STYLE_ALIASES[item] ?? item)
    .filter((item) => VALID_FONT_STYLES.has(item));

  return Array.from(new Set(styles)).join(" ");
}

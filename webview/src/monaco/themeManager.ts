/**
 * Applies VS Code theme data forwarded by the extension host to Monaco.
 *
 * Uses Monaco's native `defineTheme` / `setTheme` API — no VS Code workbench
 * configuration service involved.
 */
import * as monaco from "monaco-editor";
import type { MonacoThemeData, MonacoTokenRule } from "@shared/protocol";
import { applyShikiTheme } from "./shikiTokenization";

export const WANDERER_THEME_ID = "wanderer-host";

// Pre-register the theme with a sensible base so that editors mounting before
// the first `setTheme()` call don't fall back to Monaco's built-in "light".
monaco.editor.defineTheme(WANDERER_THEME_ID, {
  base: detectBaseThemeName(),
  inherit: true,
  rules: [],
  colors: {},
});

/**
 * Apply theme data received from the extension host.
 * Safe to call repeatedly — each call redefines the theme and reapplies it.
 */
export function setTheme(data: MonacoThemeData): void {
  const sanitized = sanitize(data);

  const themeData: monaco.editor.IStandaloneThemeData = {
    base: sanitized.base,
    inherit: sanitized.inherit,
    rules: rulesToMonaco(sanitized.rules),
    colors: sanitized.colors,
  };

  monaco.editor.defineTheme(WANDERER_THEME_ID, themeData);
  monaco.editor.setTheme(WANDERER_THEME_ID);

  // Update TextMate-backed tokenization so Monaco scopes align with VS Code theme rules.
  void applyShikiTheme(sanitized);
}

// ---------- helpers ----------

function rulesToMonaco(
  rules: MonacoTokenRule[],
): monaco.editor.ITokenThemeRule[] {
  return rules
    .filter((r) => r.token || r.foreground || r.background)
    .map((r) => {
      const rule: monaco.editor.ITokenThemeRule = { token: r.token || "" };
      if (r.foreground) rule.foreground = stripHash(r.foreground);
      if (r.background) rule.background = stripHash(r.background);
      if (r.fontStyle) rule.fontStyle = r.fontStyle;
      return rule;
    });
}

function stripHash(color: string): string {
  const trimmed = color.trim();
  return trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
}

// ---------- sanitisation ----------

type MonacoBaseTheme = MonacoThemeData["base"];

function sanitize(theme: MonacoThemeData): MonacoThemeData {
  const normalizedColors = normalizeColorMap(theme.colors);
  const vscodeColors = readVsCodeColorOverrides();

  return {
    base: normalizeBase(theme.base),
    inherit: theme.inherit !== false,
    rules: normalizeRules(theme.rules),
    colors: { ...normalizedColors, ...vscodeColors },
    name: theme.name,
  };
}

function normalizeBase(base: unknown): MonacoBaseTheme {
  if (
    base === "vs" ||
    base === "vs-dark" ||
    base === "hc-black" ||
    base === "hc-light"
  ) {
    return base;
  }
  return detectBaseThemeName();
}

function normalizeRules(rules: unknown): MonacoTokenRule[] {
  if (!Array.isArray(rules)) return [];

  const normalized: MonacoTokenRule[] = [];
  for (const entry of rules) {
    if (!isRecord(entry)) continue;

    const token = typeof entry.token === "string" ? entry.token.trim() : "";
    const foreground = normalizeTokenColor(entry.foreground);
    const background = normalizeTokenColor(entry.background);
    const fontStyle =
      typeof entry.fontStyle === "string" && entry.fontStyle.trim().length > 0
        ? entry.fontStyle.trim()
        : undefined;

    if (!token && !foreground && !background) continue;

    const rule: MonacoTokenRule = { token };
    if (foreground) rule.foreground = foreground;
    if (background) rule.background = background;
    if (fontStyle) rule.fontStyle = fontStyle;
    normalized.push(rule);
  }

  return normalized;
}

function normalizeColorMap(colors: unknown): Record<string, string> {
  if (!isRecord(colors)) return {};

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(colors)) {
    const color = normalizeUiColor(value);
    if (color) normalized[key] = color;
  }
  return normalized;
}

function normalizeUiColor(color: unknown): string | undefined {
  if (typeof color !== "string") return undefined;
  if (!isHexColor(color)) return undefined;
  return normalizeHexWithHash(color);
}

function normalizeTokenColor(color: unknown): string | undefined {
  if (typeof color !== "string") return undefined;
  const withHash = color.trim().startsWith("#")
    ? color.trim()
    : `#${color.trim()}`;
  if (!isHexColor(withHash)) return undefined;
  return normalizeHexWithHash(withHash).slice(1);
}

function normalizeHexWithHash(value: string): string {
  const color = value.trim().toLowerCase();
  if (color.length === 4 || color.length === 5) {
    const body = color.slice(1);
    return (
      "#" +
      body
        .split("")
        .map((part) => `${part}${part}`)
        .join("")
    );
  }
  return color;
}

function isHexColor(value: string): boolean {
  return /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value.trim());
}

function detectBaseThemeName(): MonacoBaseTheme {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readVsCodeColorOverrides(): Record<string, string> {
  if (typeof document === "undefined") return {};

  const style = getComputedStyle(document.documentElement);
  const map: Array<[string, string]> = [
    ["editor.background", "--vscode-editor-background"],
    ["editor.foreground", "--vscode-editor-foreground"],
    ["editorLineNumber.foreground", "--vscode-editorLineNumber-foreground"],
    [
      "editorLineNumber.activeForeground",
      "--vscode-editorLineNumber-activeForeground",
    ],
    ["editorCursor.foreground", "--vscode-editorCursor-foreground"],
    ["editor.selectionBackground", "--vscode-editor-selectionBackground"],
    [
      "editor.inactiveSelectionBackground",
      "--vscode-editor-inactiveSelectionBackground",
    ],
    [
      "editor.lineHighlightBackground",
      "--vscode-editor-lineHighlightBackground",
    ],
    ["editorWhitespace.foreground", "--vscode-editorWhitespace-foreground"],
    [
      "editorBracketHighlight.unexpectedBracket.foreground",
      "--vscode-editorBracketHighlight-unexpectedBracket-foreground",
    ],
    [
      "editorBracketPairGuide.unexpectedBracket.foreground",
      "--vscode-editorBracketPairGuide-unexpectedBracket-foreground",
    ],
  ];

  for (let index = 1; index <= 6; index += 1) {
    map.push([
      `editorBracketHighlight.foreground${index}`,
      `--vscode-editorBracketHighlight-foreground${index}`,
    ]);
    map.push([
      `editorBracketPairGuide.background${index}`,
      `--vscode-editorBracketPairGuide-background${index}`,
    ]);
    map.push([
      `editorBracketPairGuide.activeBackground${index}`,
      `--vscode-editorBracketPairGuide-activeBackground${index}`,
    ]);
    map.push([
      `editorBracketPairGuide.horizontal.background${index}`,
      `--vscode-editorBracketPairGuide-horizontal-background${index}`,
    ]);
    map.push([
      `editorBracketPairGuide.horizontal.activeBackground${index}`,
      `--vscode-editorBracketPairGuide-horizontal-activeBackground${index}`,
    ]);
  }

  const out: Record<string, string> = {};
  for (const [monacoKey, cssVar] of map) {
    const raw = style.getPropertyValue(cssVar).trim();
    const normalized = normalizeUiColor(raw) ?? normalizeRgbColor(raw);
    if (normalized) out[monacoKey] = normalized;
  }
  return out;
}

function normalizeRgbColor(value: string): string | undefined {
  const match = value
    .trim()
    .match(
      /^rgba?\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*\.?\d+))?\)$/i,
    );
  if (!match) return undefined;

  const r = clamp255(Number(match[1]));
  const g = clamp255(Number(match[2]));
  const b = clamp255(Number(match[3]));
  const alpha = match[4] === undefined ? 1 : clampUnit(Number(match[4]));

  if (alpha === 1) return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(Math.round(alpha * 255))}`;
}

function clamp255(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, "0");
}

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { parse } from "jsonc-parser/lib/esm/main.js";
import { parse as parsePlist } from "plist";
import type {
  MonacoThemeData,
  MonacoTokenRule,
} from "../../../shared/protocol";

/**
 * Resolves the current VS Code theme into Monaco-compatible data and forwards
 * updates whenever the active workbench theme changes.
 */
export class ThemeService implements vscode.Disposable {
  private readonly subs: vscode.Disposable[] = [];
  private lastFingerprint = "";

  constructor(private readonly onChange: (theme: MonacoThemeData) => void) {
    this.subs.push(
      vscode.window.onDidChangeActiveColorTheme(() => this.emitIfChanged()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration("workbench.colorTheme") ||
          event.affectsConfiguration("workbench.preferredDarkColorTheme") ||
          event.affectsConfiguration("workbench.preferredLightColorTheme") ||
          event.affectsConfiguration("window.autoDetectColorScheme") ||
          event.affectsConfiguration("editor.tokenColorCustomizations") ||
          event.affectsConfiguration("editor.semanticTokenColorCustomizations")
        ) {
          this.emitIfChanged();
        }
      }),
    );
  }

  /** Send the current theme to the callback. */
  send(): void {
    this.emitIfChanged(true);
  }

  dispose(): void {
    while (this.subs.length) this.subs.pop()?.dispose();
  }

  // ---- internals ----

  resolve(): MonacoThemeData {
    const activeKind = vscode.window.activeColorTheme.kind;

    // When "Auto Detect Color Scheme" is active, the effective theme comes
    // from preferredDarkColorTheme / preferredLightColorTheme, not colorTheme.
    const autoDetect = vscode.workspace
      .getConfiguration("window")
      .get<boolean>("autoDetectColorScheme", false);

    let configuredTheme: string;
    if (autoDetect) {
      const wantsDark =
        activeKind === vscode.ColorThemeKind.Dark ||
        activeKind === vscode.ColorThemeKind.HighContrast;
      const key = wantsDark
        ? "preferredDarkColorTheme"
        : "preferredLightColorTheme";
      configuredTheme = vscode.workspace
        .getConfiguration("workbench")
        .get<string>(key, "");
    } else {
      configuredTheme = vscode.workspace
        .getConfiguration("workbench")
        .get<string>("colorTheme", "");
    }

    const contribution = findThemeContribution(configuredTheme, activeKind);
    const base = themeBase(activeKind);
    const userTokenOverrides =
      readUserTokenColorCustomizations(configuredTheme);

    if (!contribution) {
      return {
        base,
        inherit: true,
        rules: tokenColorsToRules(userTokenOverrides),
        colors: {},
        name: configuredTheme || undefined,
      };
    }

    const resolved = this.readThemeFile(contribution.path, new Set<string>());
    const rules = tokenColorsToRules([
      ...resolved.tokenColors,
      ...userTokenOverrides,
    ]);
    return {
      base,
      inherit: true,
      rules,
      colors: resolved.colors,
      name: configuredTheme || undefined,
    };
  }

  private readThemeFile(
    filePath: string,
    visited: Set<string>,
  ): {
    colors: Record<string, string>;
    tokenColors: TokenColorSetting[];
  } {
    const normalizedPath = path.normalize(filePath);
    if (visited.has(normalizedPath)) {
      return { colors: {}, tokenColors: [] };
    }
    visited.add(normalizedPath);

    const raw = safeReadFile(filePath);
    if (!raw) {
      return { colors: {}, tokenColors: [] };
    }

    const parsed = parseThemeFile(raw);
    if (!parsed) {
      return { colors: {}, tokenColors: [] };
    }

    let colors: Record<string, string> = {};
    let tokenColors: TokenColorSetting[] = [];

    if (
      typeof parsed.include === "string" &&
      parsed.include.trim().length > 0
    ) {
      const includePath = path.resolve(path.dirname(filePath), parsed.include);
      const included = this.readThemeFile(includePath, visited);
      colors = { ...included.colors };
      tokenColors = [...included.tokenColors];
    }

    if (
      typeof parsed.tokenColors === "string" &&
      parsed.tokenColors.length > 0
    ) {
      const tokenPath = path.resolve(
        path.dirname(filePath),
        parsed.tokenColors,
      );
      tokenColors.push(...readTokenColorsFile(tokenPath, visited));
    } else if (Array.isArray(parsed.tokenColors)) {
      tokenColors.push(...collectTokenColorSettings(parsed.tokenColors));
    }

    if (Array.isArray(parsed.settings)) {
      tokenColors.push(...collectTokenColorSettings(parsed.settings));
    }

    colors = { ...colors, ...normalizeColorMap(parsed.colors) };

    return { colors, tokenColors };
  }

  private emitIfChanged(force = false): void {
    const theme = this.resolve();
    const fingerprint = JSON.stringify(theme);
    if (!force && fingerprint === this.lastFingerprint) {
      return;
    }
    this.lastFingerprint = fingerprint;
    this.onChange(theme);
  }
}

// ---- helpers ----

function findThemeContribution(
  themeName: string,
  activeKind: vscode.ColorThemeKind,
): ThemeContributionWithPath | null {
  if (!themeName) {
    return null;
  }

  const idMatches: ThemeContributionWithPath[] = [];
  const labelMatches: ThemeContributionWithPath[] = [];

  for (const ext of vscode.extensions.all) {
    const themes = ext.packageJSON?.contributes?.themes as
      | ThemeContribution[]
      | undefined;

    if (!Array.isArray(themes)) {
      continue;
    }

    for (const theme of themes) {
      const resolvedPath = path.resolve(ext.extensionPath, theme.path);
      if (theme.id === themeName) {
        idMatches.push({
          id: theme.id,
          label: theme.label,
          uiTheme: theme.uiTheme,
          path: resolvedPath,
        });
      }
      if (theme.label === themeName) {
        labelMatches.push({
          id: theme.id,
          label: theme.label,
          uiTheme: theme.uiTheme,
          path: resolvedPath,
        });
      }
    }
  }

  return (
    pickMatchByKind(idMatches, activeKind) ??
    pickMatchByKind(labelMatches, activeKind) ??
    idMatches[0] ??
    labelMatches[0] ??
    null
  );
}

function pickMatchByKind(
  matches: ThemeContributionWithPath[],
  activeKind: vscode.ColorThemeKind,
): ThemeContributionWithPath | null {
  for (const match of matches) {
    if (isUiThemeCompatible(match.uiTheme, activeKind)) {
      return match;
    }
  }
  return null;
}

function isUiThemeCompatible(
  uiTheme: string | undefined,
  activeKind: vscode.ColorThemeKind,
): boolean {
  if (!uiTheme) {
    return true;
  }

  if (activeKind === vscode.ColorThemeKind.Light) {
    return uiTheme === "vs";
  }

  if (activeKind === vscode.ColorThemeKind.HighContrastLight) {
    return uiTheme === "hc-light";
  }

  if (activeKind === vscode.ColorThemeKind.HighContrast) {
    return uiTheme === "hc-black";
  }

  return uiTheme === "vs-dark";
}

/** Fallback: map activeColorTheme.kind to Monaco base. */
function themeBase(
  kind: vscode.ColorThemeKind,
): "vs" | "vs-dark" | "hc-black" | "hc-light" {
  switch (kind) {
    case vscode.ColorThemeKind.Light:
      return "vs";
    case vscode.ColorThemeKind.HighContrastLight:
      return "hc-light";
    case vscode.ColorThemeKind.HighContrast:
      return "hc-black";
    default:
      return "vs-dark";
  }
}

function tokenColorsToRules(
  tokenColors: TokenColorSetting[],
): MonacoTokenRule[] {
  const rules: MonacoTokenRule[] = [];
  for (const entry of tokenColors) {
    const scopes = normalizeScopes(entry.scope);
    const fg = normalizeColor(entry.settings?.foreground);
    const bg = normalizeColor(entry.settings?.background);
    const fontStyle = normalizeFontStyle(entry.settings?.fontStyle);
    for (const scope of scopes) {
      if (!scope && !fg && !bg) continue;
      const rule: MonacoTokenRule = { token: scope };
      if (fg) rule.foreground = fg;
      if (bg) rule.background = bg;
      if (fontStyle) rule.fontStyle = fontStyle;
      rules.push(rule);
    }
  }
  return rules;
}

/** Monaco expects hex colors WITHOUT the leading '#'. */
function normalizeColor(color: string | undefined): string | undefined {
  if (!color) return undefined;
  if (!isHexColor(color)) return undefined;
  return normalizeHexWithHash(color).slice(1);
}

function normalizeScopes(scope: string | string[] | undefined): string[] {
  if (Array.isArray(scope)) {
    return scope.map((item) => item.trim()).filter(Boolean);
  }
  if (typeof scope === "string") {
    return scope
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [""];
}

function normalizeFontStyle(fontStyle: string | undefined): string | undefined {
  if (!fontStyle) return undefined;
  const normalized = fontStyle.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeColorMap(
  colors: Record<string, unknown> | undefined,
): Record<string, string> {
  if (!colors) return {};

  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(colors)) {
    if (typeof value !== "string") continue;
    if (!isHexColor(value)) continue;
    out[name] = normalizeHexWithHash(value);
  }
  return out;
}

function readUserTokenColorCustomizations(
  themeName: string,
): TokenColorSetting[] {
  const customizations = vscode.workspace
    .getConfiguration("editor")
    .get<unknown>("tokenColorCustomizations");

  if (!isRecord(customizations)) {
    return [];
  }

  const merged = mergeTokenCustomizationBuckets(customizations, themeName);
  const settings: TokenColorSetting[] = [];

  settings.push(...readSimpleTokenCustomizations(merged));

  if (Array.isArray(merged.textMateRules)) {
    settings.push(...collectTokenColorSettings(merged.textMateRules));
  }

  return settings;
}

function mergeTokenCustomizationBuckets(
  customizations: Record<string, unknown>,
  themeName: string,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(customizations)) {
    if (isThemeSelectorKey(key)) continue;
    merged[key] = value;
  }

  if (themeName) {
    const themeBucket = customizations[`[${themeName}]`];
    if (isRecord(themeBucket)) {
      for (const [key, value] of Object.entries(themeBucket)) {
        merged[key] = value;
      }
    }
  }

  return merged;
}

function isThemeSelectorKey(key: string): boolean {
  return key.startsWith("[") && key.endsWith("]");
}

function readSimpleTokenCustomizations(
  customizations: Record<string, unknown>,
): TokenColorSetting[] {
  const out: TokenColorSetting[] = [];

  for (const [key, scopes] of Object.entries(SIMPLE_TOKEN_GROUP_SCOPES)) {
    const settings = normalizeTokenCustomizationSettings(customizations[key]);
    if (!settings) continue;
    out.push({ scope: scopes, settings });
  }

  return out;
}

function normalizeTokenCustomizationSettings(
  value: unknown,
): TokenColorSetting["settings"] | undefined {
  if (typeof value === "string") {
    return { foreground: value };
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const settings: TokenColorSetting["settings"] = {};
  if (typeof value.foreground === "string") {
    settings.foreground = value.foreground;
  }
  if (typeof value.background === "string") {
    settings.background = value.background;
  }
  if (typeof value.fontStyle === "string") {
    settings.fontStyle = value.fontStyle;
  }

  if (!settings.foreground && !settings.background && !settings.fontStyle) {
    return undefined;
  }

  return settings;
}

function collectTokenColorSettings(values: unknown[]): TokenColorSetting[] {
  return values.filter(isTokenColorSetting);
}

function readTokenColorsFile(
  filePath: string,
  visited: Set<string>,
): TokenColorSetting[] {
  const normalizedPath = path.normalize(filePath);
  if (visited.has(normalizedPath)) {
    return [];
  }
  visited.add(normalizedPath);

  const raw = safeReadFile(filePath);
  if (!raw) {
    return [];
  }

  const parsed = parseThemeFile(raw);
  if (!parsed) {
    return [];
  }

  const tokenColors: TokenColorSetting[] = [];
  if (Array.isArray(parsed.tokenColors)) {
    tokenColors.push(...collectTokenColorSettings(parsed.tokenColors));
  }
  if (Array.isArray(parsed.settings)) {
    tokenColors.push(...collectTokenColorSettings(parsed.settings));
  }

  return tokenColors;
}

function parseThemeFile(raw: string): ThemeFile | null {
  const parsedJsonc = parse(raw) as unknown;
  if (isRecord(parsedJsonc)) {
    return parsedJsonc as ThemeFile;
  }

  try {
    const parsedPlist = parsePlist(raw) as unknown;
    if (!isRecord(parsedPlist)) {
      return null;
    }

    return {
      include:
        typeof parsedPlist.include === "string"
          ? parsedPlist.include
          : undefined,
      colors: isRecord(parsedPlist.colors)
        ? (parsedPlist.colors as Record<string, unknown>)
        : undefined,
      tokenColors: Array.isArray(parsedPlist.tokenColors)
        ? parsedPlist.tokenColors
        : undefined,
      settings: Array.isArray(parsedPlist.settings)
        ? parsedPlist.settings
        : undefined,
    };
  } catch {
    return null;
  }
}

function safeReadFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function isTokenColorSetting(value: unknown): value is TokenColorSetting {
  if (!isRecord(value)) {
    return false;
  }

  if ("scope" in value) {
    const scope = value.scope;
    const isScopeValid =
      typeof scope === "string" ||
      (Array.isArray(scope) && scope.every((part) => typeof part === "string"));
    if (!isScopeValid) {
      return false;
    }
  }

  if (
    "settings" in value &&
    value.settings !== undefined &&
    !isRecord(value.settings)
  ) {
    return false;
  }

  return true;
}

function isHexColor(value: string): boolean {
  return /^#([\da-fA-F]{3,4}|[\da-fA-F]{6}|[\da-fA-F]{8})$/.test(value.trim());
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// ---- types for theme JSON files ----

interface ThemeContribution {
  id?: string;
  label?: string;
  uiTheme?: string;
  path: string;
}

const SIMPLE_TOKEN_GROUP_SCOPES: Record<string, string[]> = {
  comments: ["comment", "punctuation.definition.comment"],
  strings: ["string", "meta.embedded.assembly"],
  keywords: ["keyword", "storage.type", "storage.modifier"],
  numbers: ["constant.numeric"],
  types: ["entity.name.type", "support.type"],
  functions: ["entity.name.function", "support.function"],
  variables: ["variable", "entity.name.variable"],
};

interface ThemeContributionWithPath extends ThemeContribution {
  path: string;
}

interface TokenColorSetting {
  scope?: string | string[];
  settings?: {
    foreground?: string;
    background?: string;
    fontStyle?: string;
  };
}

interface ThemeFile {
  include?: string;
  colors?: Record<string, unknown>;
  tokenColors?: unknown[] | string;
  settings?: unknown[];
}

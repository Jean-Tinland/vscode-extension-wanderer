import * as vscode from "vscode";
import type {
  LocationLike,
  RangeLike,
  MarkdownString,
  CompletionItemData,
  CompletionRangeData,
  FormatEdit,
} from "../../../shared/protocol";

export class LanguageProxy {
  async getDefinitions(
    uri: vscode.Uri,
    position: vscode.Position,
  ): Promise<LocationLike[]> {
    const result = await vscode.commands.executeCommand<
      vscode.Location[] | vscode.LocationLink[]
    >("vscode.executeDefinitionProvider", uri, position);
    return (result ?? [])
      .map(normalize)
      .filter((l): l is LocationLike => l !== null);
  }

  async getReferences(
    uri: vscode.Uri,
    position: vscode.Position,
  ): Promise<LocationLike[]> {
    const result = await vscode.commands.executeCommand<vscode.Location[]>(
      "vscode.executeReferenceProvider",
      uri,
      position,
    );
    const normalized = (result ?? [])
      .map(normalize)
      .filter((l): l is LocationLike => l !== null);
    return filterOutImportOnlyReferences(normalized);
  }

  async getHover(
    uri: vscode.Uri,
    position: vscode.Position,
  ): Promise<MarkdownString[]> {
    const result = await vscode.commands.executeCommand<vscode.Hover[]>(
      "vscode.executeHoverProvider",
      uri,
      position,
    );
    if (!result) return [];
    const contents: MarkdownString[] = [];
    for (const hover of result) {
      for (const c of hover.contents) {
        if (typeof c === "string") {
          contents.push({ value: c });
        } else if (c instanceof vscode.MarkdownString) {
          contents.push({ value: c.value });
        } else if ("value" in c) {
          // { language, value } code block
          contents.push({
            value: `\`\`\`${(c as { language: string; value: string }).language}\n${(c as { language: string; value: string }).value}\n\`\`\``,
          });
        }
      }
    }
    return contents;
  }

  async getCompletions(
    uri: vscode.Uri,
    position: vscode.Position,
    triggerCharacter?: string,
  ): Promise<{ items: CompletionItemData[]; isIncomplete?: boolean }> {
    const result = await vscode.commands.executeCommand<vscode.CompletionList>(
      "vscode.executeCompletionItemProvider",
      uri,
      position,
      triggerCharacter,
    );
    if (!result) {
      return { items: [] };
    }

    const items = result.items.map((item) => {
      const label =
        typeof item.label === "string" ? item.label : item.label.label;
      const labelDetail =
        typeof item.label === "string" ? undefined : item.label.detail;
      const labelDescription =
        typeof item.label === "string" ? undefined : item.label.description;
      let doc: string | undefined;
      if (typeof item.documentation === "string") {
        doc = item.documentation;
      } else if (item.documentation instanceof vscode.MarkdownString) {
        doc = item.documentation.value;
      }

      const isSnippet = item.insertText instanceof vscode.SnippetString;
      const insertText: string = isSnippet
        ? (item.insertText as vscode.SnippetString).value
        : ((item.insertText as string | undefined) ?? label);

      return {
        label,
        labelDetail,
        labelDescription,
        kind: mapCompletionKind(item.kind),
        detail: item.detail,
        documentation: doc,
        insertText,
        isSnippet: isSnippet || undefined,
        sortText: item.sortText,
        filterText: item.filterText,
        preselect: item.preselect || undefined,
        commitCharacters: item.commitCharacters
          ? [...item.commitCharacters]
          : undefined,
        tags: item.tags?.map((tag) => Number(tag)),
        range: completionRangeOf(item.range),
      };
    });

    return {
      items,
      isIncomplete: result.isIncomplete || undefined,
    };
  }

  async formatDocument(uri: vscode.Uri): Promise<FormatEdit[]> {
    const cfg = vscode.workspace.getConfiguration("editor", uri);
    const options: vscode.FormattingOptions = {
      tabSize: cfg.get<number>("tabSize", 4),
      insertSpaces: cfg.get<boolean>("insertSpaces", true),
    };
    const result = await vscode.commands.executeCommand<vscode.TextEdit[]>(
      "vscode.executeFormatDocumentProvider",
      uri,
      options,
    );
    if (!result) return [];
    return result.map((e) => ({
      startLine: e.range.start.line,
      startCharacter: e.range.start.character,
      endLine: e.range.end.line,
      endCharacter: e.range.end.character,
      text: e.newText,
    }));
  }
}

function mapCompletionKind(
  kind: vscode.CompletionItemKind | undefined,
): number {
  // Monaco CompletionItemKind values (0-based index).
  // VS Code kinds map reasonably well to Monaco kinds.
  if (kind === undefined) return 18; // Text
  const map: Record<number, number> = {
    [vscode.CompletionItemKind.Text]: 18,
    [vscode.CompletionItemKind.Method]: 0,
    [vscode.CompletionItemKind.Function]: 1,
    [vscode.CompletionItemKind.Constructor]: 2,
    [vscode.CompletionItemKind.Field]: 3,
    [vscode.CompletionItemKind.Variable]: 4,
    [vscode.CompletionItemKind.Class]: 5,
    [vscode.CompletionItemKind.Interface]: 7,
    [vscode.CompletionItemKind.Module]: 8,
    [vscode.CompletionItemKind.Property]: 9,
    [vscode.CompletionItemKind.Unit]: 12,
    [vscode.CompletionItemKind.Value]: 13,
    [vscode.CompletionItemKind.Enum]: 15,
    [vscode.CompletionItemKind.Keyword]: 17,
    [vscode.CompletionItemKind.Snippet]: 27,
    [vscode.CompletionItemKind.Color]: 19,
    [vscode.CompletionItemKind.File]: 20,
    [vscode.CompletionItemKind.Reference]: 21,
    [vscode.CompletionItemKind.Folder]: 23,
    [vscode.CompletionItemKind.EnumMember]: 16,
    [vscode.CompletionItemKind.Constant]: 14,
    [vscode.CompletionItemKind.Struct]: 6,
    [vscode.CompletionItemKind.Event]: 10,
    [vscode.CompletionItemKind.Operator]: 11,
    [vscode.CompletionItemKind.TypeParameter]: 24,
  };
  return map[kind] ?? 18;
}

function completionRangeOf(
  range:
    | vscode.Range
    | {
        inserting: vscode.Range;
        replacing: vscode.Range;
      }
    | undefined,
): CompletionRangeData | undefined {
  if (!range) return undefined;
  if ("start" in range && "end" in range) {
    return rangeOf(range);
  }

  return {
    insert: rangeOf(range.inserting),
    replace: rangeOf(range.replacing),
  };
}

function normalize(
  loc: vscode.Location | vscode.LocationLink,
): LocationLike | null {
  if ("targetUri" in loc) {
    return {
      uri: loc.targetUri.toString(),
      range: rangeOf(loc.targetSelectionRange ?? loc.targetRange),
    };
  }
  if ("uri" in loc && loc.uri) {
    return { uri: loc.uri.toString(), range: rangeOf(loc.range) };
  }
  return null;
}

function rangeOf(r: vscode.Range): RangeLike {
  return {
    startLine: r.start.line,
    startCharacter: r.start.character,
    endLine: r.end.line,
    endCharacter: r.end.character,
  };
}

async function filterOutImportOnlyReferences(
  locations: LocationLike[],
): Promise<LocationLike[]> {
  if (locations.length === 0) return locations;

  const documentCache = new Map<string, vscode.TextDocument | null>();
  const filtered: LocationLike[] = [];

  for (const location of locations) {
    const document = await getDocumentForLocation(location.uri, documentCache);
    if (!document || !isImportOnlyReference(document, location.range)) {
      filtered.push(location);
    }
  }

  return filtered;
}

async function getDocumentForLocation(
  uriString: string,
  cache: Map<string, vscode.TextDocument | null>,
): Promise<vscode.TextDocument | null> {
  if (cache.has(uriString)) {
    return cache.get(uriString) ?? null;
  }

  try {
    const document = await vscode.workspace.openTextDocument(
      vscode.Uri.parse(uriString),
    );
    cache.set(uriString, document);
    return document;
  } catch {
    cache.set(uriString, null);
    return null;
  }
}

function isImportOnlyReference(
  document: vscode.TextDocument,
  range: RangeLike,
): boolean {
  const line = range.startLine;
  if (line < 0 || line >= document.lineCount) return false;

  const lineText = document.lineAt(line).text;
  const trimmed = lineText.trim();
  if (!trimmed) return false;

  if (isDirectImportLine(document.languageId, trimmed)) {
    return true;
  }

  if (isJavaScriptLikeImportContinuation(document, line)) {
    return true;
  }

  return false;
}

function isDirectImportLine(languageId: string, trimmedLine: string): boolean {
  if (
    languageId === "javascript" ||
    languageId === "javascriptreact" ||
    languageId === "typescript" ||
    languageId === "typescriptreact"
  ) {
    return /^import\b/.test(trimmedLine);
  }

  if (languageId === "python") {
    return /^(from\b.+\bimport\b|import\b)/.test(trimmedLine);
  }

  if (languageId === "go") {
    return /^import\b/.test(trimmedLine);
  }

  if (
    languageId === "java" ||
    languageId === "kotlin" ||
    languageId === "scala"
  ) {
    return /^import\b/.test(trimmedLine);
  }

  if (languageId === "rust") {
    return /^use\b/.test(trimmedLine);
  }

  if (
    languageId === "c" ||
    languageId === "cpp" ||
    languageId === "objective-c"
  ) {
    return /^#\s*include\b/.test(trimmedLine);
  }

  if (languageId === "csharp") {
    return /^using\s+[\w.]+\s*;?$/.test(trimmedLine);
  }

  return false;
}

function isJavaScriptLikeImportContinuation(
  document: vscode.TextDocument,
  line: number,
): boolean {
  if (!isJavaScriptLikeLanguage(document.languageId)) return false;

  const currentTrimmed = document.lineAt(line).text.trim();
  if (/^import\b/.test(currentTrimmed)) return true;

  const lookBackLimit = Math.max(0, line - 12);
  let importStartLine = -1;

  for (let idx = line - 1; idx >= lookBackLimit; idx--) {
    const candidate = document.lineAt(idx).text.trim();
    if (candidate.length === 0) break;
    if (/^import\b/.test(candidate)) {
      importStartLine = idx;
      break;
    }
    if (candidate.includes(";")) break;
  }

  if (importStartLine < 0) return false;

  for (let idx = importStartLine; idx < line; idx++) {
    if (document.lineAt(idx).text.includes(";")) return false;
  }

  const fromSearchEnd = Math.min(document.lineCount - 1, line + 4);
  for (let idx = importStartLine; idx <= fromSearchEnd; idx++) {
    const text = document.lineAt(idx).text;
    const trimmed = text.trim();
    if (/\bfrom\s+["'`]/.test(text)) return true;
    if (idx === importStartLine && /^import\s+["'`]/.test(trimmed)) {
      return true;
    }
    if (idx > importStartLine && trimmed.length === 0) break;
  }

  return false;
}

function isJavaScriptLikeLanguage(languageId: string): boolean {
  return (
    languageId === "javascript" ||
    languageId === "javascriptreact" ||
    languageId === "typescript" ||
    languageId === "typescriptreact"
  );
}

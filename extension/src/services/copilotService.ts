import * as vscode from "vscode";
import type { InlineCompletionData } from "../../../shared/protocol";

/**
 * Proxies Copilot / Language Model requests for the canvas webview editors.
 * Uses the stable `vscode.lm` API (VS Code ≥ 1.90).
 */
export class CopilotService {
  private readonly activeCancellations = new Map<
    string,
    vscode.CancellationTokenSource
  >();

  /** Cancel an in-flight request by its webview requestId. */
  cancel(requestId: string): void {
    const cts = this.activeCancellations.get(requestId);
    if (cts) {
      cts.cancel();
      this.activeCancellations.delete(requestId);
    }
  }

  /** Clean up all outstanding cancellation tokens. */
  dispose(): void {
    for (const cts of this.activeCancellations.values()) cts.cancel();
    this.activeCancellations.clear();
  }

  // ─── Inline Completions ───────────────────────────────────────────────

  async getInlineCompletions(
    requestId: string,
    fileUri: string,
    _line: number,
    _character: number,
    textBeforeCursor: string,
    textAfterCursor: string,
    languageId: string,
  ): Promise<InlineCompletionData[]> {
    const models = await vscode.lm.selectChatModels({
      vendor: "copilot",
    });
    if (models.length === 0) return [];

    const model = models[0];
    const cts = new vscode.CancellationTokenSource();
    this.activeCancellations.set(requestId, cts);

    const prefix = truncate(textBeforeCursor, 3000);
    const suffix = truncate(textAfterCursor, 1000);

    const messages = [
      vscode.LanguageModelChatMessage.User(
        [
          `You are a code completion engine. Complete the code at the cursor position marked by <CURSOR>.`,
          `Return ONLY the code that should be inserted at the cursor position. No explanation, no markdown fencing, no prefix/suffix repetition.`,
          `If there is nothing meaningful to complete, return an empty string.`,
          ``,
          `Language: ${languageId}`,
          ``,
          `\`\`\`${languageId}`,
          `${prefix}<CURSOR>${suffix}`,
          `\`\`\``,
        ].join("\n"),
      ),
    ];

    try {
      const response = await model.sendRequest(messages, {}, cts.token);
      let completion = "";
      for await (const chunk of response.text) {
        if (cts.token.isCancellationRequested) return [];
        completion += chunk;
      }

      // Strip markdown fencing if the model includes it.
      completion = stripCodeFence(completion, languageId);
      completion = completion.trimEnd();

      if (!completion) return [];
      return [{ insertText: completion }];
    } catch (e) {
      if (e instanceof vscode.CancellationError) return [];
      console.warn("Wanderer: inline completion failed", e);
      return [];
    } finally {
      this.activeCancellations.delete(requestId);
    }
  }

  // ─── Inline Chat ──────────────────────────────────────────────────────

  async *runInlineChat(
    requestId: string,
    fileUri: string,
    prompt: string,
    selectedText: string,
    fullText: string,
    line: number,
    character: number,
    languageId: string,
  ): AsyncGenerator<
    | { type: "chunk"; text: string }
    | { type: "done"; text: string }
    | { type: "error"; message: string }
  > {
    const models = await vscode.lm.selectChatModels({
      vendor: "copilot",
    });
    if (models.length === 0) {
      yield {
        type: "error",
        message:
          "No language model available. Make sure GitHub Copilot is installed and signed in.",
      };
      return;
    }

    const model = models[0];
    const cts = new vscode.CancellationTokenSource();
    this.activeCancellations.set(requestId, cts);

    const hasSelection = selectedText.length > 0;
    const contextSnippet = truncate(fullText, 6000);

    const systemPrompt = hasSelection
      ? [
          `You are a code editing assistant. The user has selected a portion of code and wants you to modify it according to their instruction.`,
          `Return ONLY the replacement code. No explanations, no markdown fencing. The output replaces the selected code exactly.`,
        ].join("\n")
      : [
          `You are a code editing assistant. The user wants you to generate code according to their instruction at line ${line + 1}, column ${character + 1}.`,
          `Return ONLY the code to insert. No explanations, no markdown fencing.`,
        ].join("\n");

    const userContent = hasSelection
      ? [
          `Language: ${languageId}`,
          `File: ${fileUri}`,
          ``,
          `Full file context:`,
          `\`\`\`${languageId}`,
          contextSnippet,
          `\`\`\``,
          ``,
          `Selected code:`,
          `\`\`\`${languageId}`,
          selectedText,
          `\`\`\``,
          ``,
          `Instruction: ${prompt}`,
        ].join("\n")
      : [
          `Language: ${languageId}`,
          `File: ${fileUri}`,
          ``,
          `Full file context:`,
          `\`\`\`${languageId}`,
          contextSnippet,
          `\`\`\``,
          ``,
          `Cursor is at line ${line + 1}, column ${character + 1}.`,
          ``,
          `Instruction: ${prompt}`,
        ].join("\n");

    const messages = [
      vscode.LanguageModelChatMessage.User(systemPrompt),
      vscode.LanguageModelChatMessage.User(userContent),
    ];

    try {
      const response = await model.sendRequest(messages, {}, cts.token);
      let accumulated = "";
      for await (const chunk of response.text) {
        if (cts.token.isCancellationRequested) return;
        accumulated += chunk;
        yield { type: "chunk", text: chunk };
      }
      accumulated = stripCodeFence(accumulated, languageId);
      yield { type: "done", text: accumulated };
    } catch (e) {
      if (e instanceof vscode.CancellationError) return;
      const message = e instanceof Error ? e.message : String(e);
      yield { type: "error", message };
    } finally {
      this.activeCancellations.delete(requestId);
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(text.length - maxChars);
}

function stripCodeFence(text: string, languageId: string): string {
  let result = text.trim();
  const fenceStart = new RegExp(`^\`\`\`(?:${languageId})?\\s*\\n?`, "i");
  if (fenceStart.test(result)) {
    result = result.replace(fenceStart, "");
  }
  if (result.endsWith("```")) {
    result = result.slice(0, -3);
  }
  return result.trim();
}

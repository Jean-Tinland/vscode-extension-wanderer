const pendingWebviewOpenRequests = new Set<string>();

export function trackWebviewOpenRequest(requestId: string): void {
  pendingWebviewOpenRequests.add(requestId);
}

export function resolveWebviewOpenRequest(requestId: string): void {
  pendingWebviewOpenRequests.delete(requestId);
}

export function isPendingWebviewOpenRequest(requestId: string): boolean {
  return pendingWebviewOpenRequests.has(requestId);
}

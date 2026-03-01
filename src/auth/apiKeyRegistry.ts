export type ApiKeyAuthResult =
  | { ok: true; clientId: string }
  | { ok: false; reason: "invalid" | "revoked" };

export interface ApiClientState {
  clientId: string;
  enabled: boolean;
}

export class ApiKeyRegistry {
  private readonly keyToClientId = new Map<string, string>();
  private readonly clientEnabled = new Map<string, boolean>();

  constructor(apiKeysByClient: Record<string, string>) {
    for (const [clientId, apiKey] of Object.entries(apiKeysByClient)) {
      const normalizedClientId = clientId.trim();
      const normalizedKey = apiKey.trim();

      if (!normalizedClientId || !normalizedKey) {
        continue;
      }

      const existingClient = this.keyToClientId.get(normalizedKey);
      if (existingClient) {
        throw new Error(
          `Duplicate API key for clients "${existingClient}" and "${normalizedClientId}".`,
        );
      }

      this.keyToClientId.set(normalizedKey, normalizedClientId);
      this.clientEnabled.set(normalizedClientId, true);
    }

    if (!this.keyToClientId.size) {
      throw new Error("At least one API key must be configured.");
    }
  }

  authenticate(rawKey: string): ApiKeyAuthResult {
    const key = rawKey.trim();
    const clientId = this.keyToClientId.get(key);
    if (!clientId) {
      return { ok: false, reason: "invalid" };
    }

    const enabled = this.clientEnabled.get(clientId) ?? false;
    if (!enabled) {
      return { ok: false, reason: "revoked" };
    }

    return { ok: true, clientId };
  }

  revoke(clientId: string): boolean {
    if (!this.clientEnabled.has(clientId)) {
      return false;
    }

    this.clientEnabled.set(clientId, false);
    return true;
  }

  restore(clientId: string): boolean {
    if (!this.clientEnabled.has(clientId)) {
      return false;
    }

    this.clientEnabled.set(clientId, true);
    return true;
  }

  listClients(): ApiClientState[] {
    return [...this.clientEnabled.entries()]
      .map(([clientId, enabled]) => ({ clientId, enabled }))
      .sort((a, b) => a.clientId.localeCompare(b.clientId));
  }
}

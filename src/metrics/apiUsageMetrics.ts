import { ApiClientState } from "../auth/apiKeyRegistry.js";

interface MutableClientMetrics {
  requests: number;
  successes: number;
  errors: number;
  totalLatencyMs: number;
  lastRequestAt?: string;
}

export interface ApiClientMetricsSnapshot {
  clientId: string;
  enabled: boolean;
  requests: number;
  successes: number;
  errors: number;
  averageLatencyMs: number;
  lastRequestAt?: string;
}

export class ApiUsageMetrics {
  private readonly byClient = new Map<string, MutableClientMetrics>();

  record(clientId: string, statusCode: number, latencyMs: number): void {
    const current = this.byClient.get(clientId) || {
      requests: 0,
      successes: 0,
      errors: 0,
      totalLatencyMs: 0,
    };

    current.requests += 1;
    if (statusCode >= 200 && statusCode < 400) {
      current.successes += 1;
    } else {
      current.errors += 1;
    }

    current.totalLatencyMs += Number.isFinite(latencyMs) ? latencyMs : 0;
    current.lastRequestAt = new Date().toISOString();
    this.byClient.set(clientId, current);
  }

  snapshot(clientStates: ApiClientState[]): {
    generatedAt: string;
    totals: { requests: number; successes: number; errors: number };
    clients: ApiClientMetricsSnapshot[];
  } {
    const clients = clientStates
      .map(({ clientId, enabled }) => {
        const metrics = this.byClient.get(clientId);
        const requests = metrics?.requests ?? 0;
        const successes = metrics?.successes ?? 0;
        const errors = metrics?.errors ?? 0;
        return {
          clientId,
          enabled,
          requests,
          successes,
          errors,
          averageLatencyMs:
            requests > 0 && metrics
              ? Number((metrics.totalLatencyMs / requests).toFixed(2))
              : 0,
          lastRequestAt: metrics?.lastRequestAt,
        };
      })
      .sort(
        (a, b) =>
          b.requests - a.requests || a.clientId.localeCompare(b.clientId),
      );

    const totals = clients.reduce(
      (acc, client) => {
        acc.requests += client.requests;
        acc.successes += client.successes;
        acc.errors += client.errors;
        return acc;
      },
      { requests: 0, successes: 0, errors: 0 },
    );

    return {
      generatedAt: new Date().toISOString(),
      totals,
      clients,
    };
  }
}

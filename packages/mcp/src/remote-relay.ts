import type { RemoteAction, StateSnapshot } from './state.js';

const RETRY_MS = 3000;

export class RemoteRelay {
  private pendingSnapshot: StateSnapshot | null = null;
  private publishing = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly baseUrl: URL,
    private readonly relayId: string,
    private readonly relayToken: string
  ) {}

  private url(path: string): URL {
    return new URL(path.replace(/^\//, ''), this.baseUrl);
  }

  private headers(json = false): Record<string, string> {
    return {
      Authorization: `Bearer ${this.relayToken}`,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    };
  }

  publish(snapshot: StateSnapshot): void {
    this.pendingSnapshot = snapshot;
    void this.flush();
  }

  private async flush(): Promise<void> {
    if (this.publishing || !this.pendingSnapshot) return;
    this.publishing = true;
    const snapshot = this.pendingSnapshot;
    this.pendingSnapshot = null;
    try {
      const response = await fetch(this.url(`/api/relays/${this.relayId}/state`), {
        method: 'PUT',
        headers: this.headers(true),
        body: JSON.stringify(snapshot),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`remote state update failed (${response.status})`);
    } catch (error) {
      console.error(`Spec Quest relay publish error: ${String(error)}`);
      this.pendingSnapshot ??= snapshot;
      this.retryTimer ??= setTimeout(() => {
        this.retryTimer = null;
        void this.flush();
      }, RETRY_MS);
    } finally {
      this.publishing = false;
      if (this.pendingSnapshot && !this.retryTimer) void this.flush();
    }
  }

  async pollOnce(apply: (action: RemoteAction) => void, wait = true): Promise<boolean> {
    const response = await fetch(this.url(`/api/relays/${this.relayId}/actions${wait ? '?wait=1' : ''}`), {
      headers: this.headers(),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`remote action poll failed (${response.status})`);
    const body = (await response.json()) as { action: RemoteAction | null };
    if (!body.action) return false;
    try {
      apply(body.action);
    } catch (error) {
      console.error(`Spec Quest relay rejected action ${body.action.id}: ${String(error)}`);
    }
    const acknowledgement = await fetch(this.url(`/api/relays/${this.relayId}/actions/${body.action.id}/ack`), {
      method: 'POST',
      headers: this.headers(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!acknowledgement.ok) throw new Error(`remote action acknowledgement failed (${acknowledgement.status})`);
    return true;
  }

  async poll(apply: (action: RemoteAction) => void): Promise<never> {
    for (;;) {
      try {
        await this.pollOnce(apply);
      } catch (error) {
        console.error(`Spec Quest relay poll error: ${String(error)}`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
      }
    }
  }
}

export function remoteRelayFromEnvironment(environment: NodeJS.ProcessEnv = process.env): RemoteRelay | null {
  const remoteUrl = environment.SPECQUEST_REMOTE_URL;
  const relayId = environment.SPECQUEST_RELAY_ID;
  const relayToken = environment.SPECQUEST_RELAY_TOKEN;
  if (!remoteUrl && !relayId && !relayToken) return null;
  if (!remoteUrl || !relayId || !relayToken) {
    throw new Error('SPECQUEST_REMOTE_URL, SPECQUEST_RELAY_ID, and SPECQUEST_RELAY_TOKEN must be set together');
  }
  const baseUrl = new URL(remoteUrl.endsWith('/') ? remoteUrl : `${remoteUrl}/`);
  if (!['http:', 'https:'].includes(baseUrl.protocol)) throw new Error('SPECQUEST_REMOTE_URL must use http or https');
  return new RemoteRelay(baseUrl, relayId, relayToken);
}

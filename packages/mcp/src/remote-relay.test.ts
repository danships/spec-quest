import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { RemoteRelay, remoteRelayFromEnvironment } from './remote-relay.js';
import type { StateSnapshot } from './state.js';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('publishes the complete snapshot with relay credentials', async () => {
  let resolveRequest: (() => void) | undefined;
  const requested = new Promise<void>((resolve) => {
    resolveRequest = resolve;
  });
  let requestUrl = '';
  let requestInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    resolveRequest?.();
    return new Response(null, { status: 204 });
  };

  const relay = new RemoteRelay(new URL('https://relay.example/'), 'relay-1', 'secret-token');
  const snapshot: StateSnapshot = {
    protocolVersion: '1.0.0',
    session: { id: 'session-1', title: 'Quest', totalScore: 0, finished: false, answered: 0, steers: 0, resets: 0 },
    level: null,
  };
  relay.publish(snapshot);
  await requested;

  assert.equal(requestUrl, 'https://relay.example/api/relays/relay-1/state');
  assert.equal(requestInit?.method, 'PUT');
  assert.deepEqual(requestInit?.headers, {
    Authorization: 'Bearer secret-token',
    'Content-Type': 'application/json',
  });
  assert.deepEqual(JSON.parse(String(requestInit?.body)), snapshot);
});

test('requires the complete remote relay configuration', () => {
  assert.equal(remoteRelayFromEnvironment({}), null);
  assert.throws(
    () => remoteRelayFromEnvironment({ SPECQUEST_REMOTE_URL: 'https://relay.example' }),
    /must be set together/
  );
});

test('applies and acknowledges one persisted remote action', async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const action = {
    id: 'action-1',
    levelId: 'level-1',
    type: 'answer' as const,
    payload: { answer: { text: 'remote answer' } },
  };
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return requests.length === 1 ? Response.json({ action }) : new Response(null, { status: 204 });
  };
  const relay = new RemoteRelay(new URL('https://relay.example/'), 'relay-1', 'secret-token');
  let applied: typeof action | null = null;

  assert.equal(
    await relay.pollOnce((received) => {
      applied = received as typeof action;
    }, false),
    true
  );

  assert.deepEqual(applied, action);
  assert.equal(requests[0].url, 'https://relay.example/api/relays/relay-1/actions');
  assert.equal(requests[1].url, 'https://relay.example/api/relays/relay-1/actions/action-1/ack');
  assert.equal(requests[1].init?.method, 'POST');
});

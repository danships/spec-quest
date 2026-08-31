import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import type { Response } from 'express';
import { createApp } from './app.js';
import type { ServerConfig } from './config.js';
import { RelayStore } from './relay-store.js';
import { setSession, type GithubUser } from './session.js';

const directory = mkdtempSync(path.join(tmpdir(), 'spec-quest-relay-'));
const connection = `sqlite://${path.join(directory, 'relay.db')}`;
const config: ServerConfig = {
  port: 8080,
  baseUrl: new URL('http://localhost:8080'),
  githubClientId: 'test-client',
  githubClientSecret: 'test-secret',
  sessionSecret: '0123456789abcdef0123456789abcdef',
  secureCookies: false,
  supersaveConnection: connection,
};
const user: GithubUser = {
  id: 42,
  login: 'quester',
  name: 'Quest Player',
  avatarUrl: 'https://example.test/avatar.png',
  profileUrl: 'https://example.test/quester',
};

function sessionCookie(): string {
  const values: string[] = [];
  const response = {
    append(_name: string, value: string) {
      values.push(value);
      return response;
    },
  } as unknown as Response;
  setSession(response, user, config.sessionSecret, false);
  return values[0].split(';', 1)[0];
}

async function listen(store: RelayStore): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createApp(config, store).listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

before(() => rmSync(path.join(directory, 'relay.db'), { force: true }));
after(() => rmSync(directory, { recursive: true, force: true }));

test('persists snapshots and browser actions across a restart', async () => {
  let store = await RelayStore.create(connection);
  let running = await listen(store);
  const cookie = sessionCookie();

  const anonymous = await fetch(`${running.baseUrl}/api/state`);
  assert.equal(anonymous.status, 401);

  const createResponse = await fetch(`${running.baseUrl}/api/relays`, {
    method: 'POST',
    headers: { Cookie: cookie },
  });
  assert.equal(createResponse.status, 201);
  const credentials = (await createResponse.json()) as { relayId: string; relayToken: string };
  const writerHeaders = { Authorization: `Bearer ${credentials.relayToken}` };

  const state = {
    protocolVersion: '1.0.0',
    session: { id: 'session-1', title: 'Remote quest', totalScore: 0, finished: false },
    level: { id: 'level-1', type: 'riddle', prompt: 'Choose', status: 'pending', payload: {} },
  };
  const publish = await fetch(`${running.baseUrl}/api/relays/${credentials.relayId}/state`, {
    method: 'PUT',
    headers: { ...writerHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
  assert.equal(publish.status, 204);

  const browserState = await fetch(`${running.baseUrl}/api/state`, { headers: { Cookie: cookie } });
  assert.deepEqual(await browserState.json(), state);

  const answer = await fetch(`${running.baseUrl}/api/levels/level-1/answer`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer: { text: 'persist me' } }),
  });
  assert.equal(answer.status, 202);

  await running.close();
  await store.close();
  store = await RelayStore.create(connection);
  running = await listen(store);

  const persistedRelay = await store.getRelay(credentials.relayId);
  assert.ok(persistedRelay);
  assert.deepEqual(store.parseState(persistedRelay), state);

  const actionResponse = await fetch(`${running.baseUrl}/api/relays/${credentials.relayId}/actions`, {
    headers: writerHeaders,
  });
  const { action } = (await actionResponse.json()) as {
    action: { id: string; levelId: string; type: string; payload: Record<string, unknown> };
  };
  assert.equal(action.levelId, 'level-1');
  assert.equal(action.type, 'answer');
  assert.deepEqual(action.payload, { answer: { text: 'persist me' } });

  const acknowledge = await fetch(`${running.baseUrl}/api/relays/${credentials.relayId}/actions/${action.id}/ack`, {
    method: 'POST',
    headers: writerHeaders,
  });
  assert.equal(acknowledge.status, 204);
  assert.equal(await store.nextAction(credentials.relayId), null);

  await running.close();
  await store.close();
});

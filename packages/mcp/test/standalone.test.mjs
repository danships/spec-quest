import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const { createApp } = await import('../dist/app.js');
const { SpecQuestState } = await import('../dist/state.js');

function resultJson(result) {
  return JSON.parse(result.content.find((item) => item.type === 'text').text);
}

test('standalone creation and review works through MCP plus the browser API', async (context) => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'specquest-standalone-'));
  const stateDir = path.join(fixture, '.specquest');
  const specDir = path.join(fixture, 'specs');
  mkdirSync(specDir);
  writeFileSync(
    path.join(fixture, 'specquest.md'),
    `# Spec Quest configuration

## Spec format
Overview; Requirements with stable IDs; Non-goals; Architecture; Data; Acceptance tests; Edge cases; Decisions; Open risks.

## Validation
Every requirement is measurable and maps to an acceptance test. Failure and recovery paths are explicit. Decisions record alternatives.

## MCP server
Use the test server port.
`
  );

  const state = new SpecQuestState({ stateDir });
  const server = createApp({ state }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const baseUrl = `http://127.0.0.1:${address.port}`;
  const client = new Client({ name: 'specquest-standalone-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)));
  context.after(async () => {
    await client.close();
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
  const call = async (name, args = {}) => resultJson(await client.callTool({ name, arguments: args }));

  const info = await call('specquest_info');
  assert.equal(info.protocolVersion, '1.0.0');
  await call('specquest_start_session', {
    title: 'Offline action queue',
    agentModel: 'standalone-test',
    skillVersion: '0.1.0',
  });

  const conflict = await call('specquest_create_level', {
    type: 'doors',
    prompt: 'How should conflicting offline updates be resolved?',
    payload: {
      options: [
        { id: 'server', label: 'Server wins' },
        { id: 'manual', label: 'Manual resolution' },
      ],
    },
  });
  let response = await fetch(`${baseUrl}/api/levels/${conflict.levelId}/answer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ answer: { chosenId: 'manual' } }),
  });
  assert.equal(response.status, 200);
  assert.equal((await call('specquest_check_level', { levelId: conflict.levelId })).status, 'answered');

  const retention = await call('specquest_create_level', {
    type: 'riddle',
    prompt: 'How long should failed actions remain?',
    payload: { question: 'Describe the retention policy.' },
  });
  response = await fetch(`${baseUrl}/api/levels/${retention.levelId}/steer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'Ask for a number of days.' }),
  });
  assert.equal(response.status, 200);
  assert.equal((await call('specquest_check_level', { levelId: retention.levelId })).status, 'steered');

  const days = await call('specquest_create_level', {
    type: 'fill_the_rune',
    prompt: 'Choose failed-action retention.',
    payload: { template: 'Keep failed actions for ___ days.', hint: 'number' },
  });
  response = await fetch(`${baseUrl}/api/levels/${days.levelId}/answer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ answer: { value: '7' } }),
  });
  assert.equal(response.status, 200);

  const boss = await call('specquest_create_level', {
    type: 'boss',
    prompt: 'Resolve the offline queue spec review.',
    payload: {
      findings: [
        { id: 'retry', text: 'Requirements: add a measurable five-attempt retry cap.' },
        { id: 'delete', text: 'Edge cases: define delete-versus-update conflict behavior.' },
        { id: 'metric', text: 'Acceptance tests: bound queue replay completion time.' },
      ],
    },
  });
  response = await fetch(`${baseUrl}/api/levels/${boss.levelId}/answer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ answer: { resolutions: [{ id: 'retry', action: 'accept' }] } }),
  });
  assert.equal(response.status, 400);

  response = await fetch(`${baseUrl}/api/levels/${boss.levelId}/answer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      answer: {
        resolutions: [
          { id: 'retry', action: 'accept' },
          { id: 'delete', action: 'correct', correction: 'A server delete wins and archives the local update.' },
          { id: 'metric', action: 'accept' },
        ],
      },
    }),
  });
  assert.equal(response.status, 200);

  const specPath = path.join(specDir, 'offline-action-queue.md');
  writeFileSync(
    specPath,
    `# Offline action queue

## Overview
Queue supported write actions while offline and replay them after reconnection.

## Requirements
- R1: Preserve queued actions across restart and replay in creation order.
- R2: Retry transient failures with exponential backoff for at most five attempts.
- R3: Route conflicting updates to manual resolution; a server delete archives the local update.
- R4: Retain terminally failed actions for seven days.

## Non-goals
Offline reads and collaborative text merging.

## Architecture
A durable client queue feeds the existing sync API through a single replay worker.

## Data
Queue records contain id, operation, payload, createdAt, attemptCount, status, and lastError.

## Acceptance tests
- A1/R1: Restart with 100 queued actions; all replay once in creation order.
- A2/R2: A persistent transient failure stops after five attempts.
- A3/R3: Update/delete conflicts archive the update and expose manual resolution.
- A4/R4: Cleanup removes terminal failures after seven days.
- A5/R1: Replay of 100 actions completes within 30 seconds on the test network.

## Edge cases
Duplicate acknowledgements are idempotent; auth failure pauses replay; delete wins over an offline update; storage exhaustion rejects new queued writes visibly.

## Decisions
Use a durable local queue instead of memory-only or service-worker-only storage. Manual update conflicts preserve user intent better than silent last-write-wins.

## Open risks
Device clock changes may affect retention; cleanup uses server-adjusted time when available.
`
  );

  const finished = await call('specquest_finish_session', { specPath });
  assert.equal(finished.answered, 3);
  assert.equal(finished.steers, 1);
  assert.ok(finished.totalScore >= 500);
  const browserState = await (await fetch(`${baseUrl}/api/state`)).json();
  assert.equal(browserState.session.finished, true);
  assert.equal(browserState.level, null);
});

#!/usr/bin/env node
import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildMcpServer } from './mcp.js';
import * as state from './state.js';
import { PROTOCOL_VERSION } from './protocol.js';

const PORT = Number(process.env.SPECQUEST_PORT ?? 4477);
const HOST = process.env.SPECQUEST_HOST ?? '127.0.0.1';
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const app = express();
app.use(express.json({ limit: '1mb' }));

// --- MCP endpoint (stateless: one transport per request) ---------------------
app.post('/mcp', async (request, response) => {
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    response.on('close', () => transport.close());
    await buildMcpServer().connect(transport);
    await transport.handleRequest(request, response, request.body);
  } catch (error) {
    if (!response.headersSent) response.status(500).json({ error: String(error) });
  }
});
app.get('/mcp', (_request, response) => response.status(405).end());

// --- Web app API --------------------------------------------------------------
app.get('/api/state', async (request, response) => {
  // Long-poll support: ?wait=1 holds the request until something changes.
  if (request.query.wait) await state.onChange(20_000);
  const session = state.getSession();
  response.json({
    protocolVersion: PROTOCOL_VERSION,
    session: session
      ? {
          id: session.id,
          title: session.title,
          totalScore: session.totalScore,
          finished: !!session.finishedAt,
          ...state.stats(),
        }
      : null,
    level: state.currentLevel(),
  });
});

function act(action: (id: string, body: Record<string, unknown>) => unknown) {
  return (request: express.Request, response: express.Response) => {
    try {
      response.json(action(request.params.id, request.body ?? {}));
    } catch (error) {
      response.status(400).json({ error: String(error) });
    }
  };
}

app.post(
  '/api/levels/:id/answer',
  act((id, body) => state.answerLevel(id, body.answer))
);
app.post(
  '/api/levels/:id/steer',
  act((id, body) => {
    if (typeof body.text !== 'string' || !body.text) throw new Error('steer needs text');
    return state.steerLevel(id, body.text);
  })
);
app.post(
  '/api/levels/:id/reset',
  act((id) => state.resetLevel(id))
);

// --- Static web app -------------------------------------------------------------
app.use(express.static(PUBLIC_DIR));

state.restore();
app.listen(PORT, HOST, () => {
  console.log(`Spec Quest ready on http://${HOST}:${PORT} (protocol ${PROTOCOL_VERSION})`);
  console.log(`MCP endpoint: http://${HOST}:${PORT}/mcp`);
});

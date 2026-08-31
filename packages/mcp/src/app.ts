import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildMcpServer } from './mcp.js';
import { PROTOCOL_VERSION } from './protocol.js';
import type { SpecQuestState } from './state.js';

const DEFAULT_PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

export interface CreateAppOptions {
  state: SpecQuestState;
  publicDirectory?: string;
}

/** Build the HTTP application without binding a port or creating global state. */
export function createApp({ state, publicDirectory = DEFAULT_PUBLIC_DIR }: CreateAppOptions): express.Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // --- MCP endpoint (stateless: one transport per request) -------------------
  app.post('/mcp', async (request, response) => {
    try {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      response.on('close', () => transport.close());
      await buildMcpServer(state).connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      if (!response.headersSent) response.status(500).json({ error: String(error) });
    }
  });
  app.get('/mcp', (_request, response) => response.status(405).end());

  // --- Web app API ------------------------------------------------------------
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

  app.use(express.static(publicDirectory));
  return app;
}

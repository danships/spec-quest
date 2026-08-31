import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { ServerConfig } from './config.js';
import { type RelayActionType, type RelayState, RelayStore, relayTokenMatches } from './relay-store.js';
import { readSession } from './session.js';

const LONG_POLL_MS = 20_000;

class Waiters {
  private readonly waiters = new Map<string, Set<() => void>>();

  wait(key: string): Promise<void> {
    return new Promise((resolve) => {
      const callbacks = this.waiters.get(key) ?? new Set<() => void>();
      const timer = setTimeout(() => {
        callbacks.delete(wake);
        resolve();
      }, LONG_POLL_MS);
      const wake = () => {
        clearTimeout(timer);
        callbacks.delete(wake);
        resolve();
      };
      callbacks.add(wake);
      this.waiters.set(key, callbacks);
    });
  }

  notify(key: string): void {
    for (const wake of this.waiters.get(key) ?? []) wake();
    this.waiters.delete(key);
  }
}

function asyncRoute(handler: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next: NextFunction) => {
    handler(request, response).catch(next);
  };
}

function bearerToken(request: Request): string | null {
  const match = /^Bearer (\S+)$/i.exec(request.headers.authorization ?? '');
  return match?.[1] ?? null;
}

function ownerId(request: Request, config: ServerConfig): string | null {
  const session = readSession(request, config.sessionSecret);
  return session ? String(session.user.id) : null;
}

function objectOrNull(field: unknown): boolean {
  return field === null || (!!field && typeof field === 'object');
}

function validState(value: unknown): value is RelayState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<RelayState>;
  return state.protocolVersion === '1.0.0' && objectOrNull(state.session) && objectOrNull(state.level);
}

function currentLevelId(store: RelayStore, stateRelay: Awaited<ReturnType<RelayStore['getRelay']>>): string | null {
  if (!stateRelay) return null;
  const level = store.parseState(stateRelay).level;
  return level && typeof level.id === 'string' ? level.id : null;
}

function actionPayload(type: RelayActionType, body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null;
  const payload = body as Record<string, unknown>;
  if (type === 'answer') return payload.answer && typeof payload.answer === 'object' ? payload : null;
  if (type === 'steer') return typeof payload.text === 'string' && payload.text ? payload : null;
  return {};
}

export function createRelayRouter(config: ServerConfig, store: RelayStore): express.Router {
  const router = express.Router();
  const actionWaiters = new Waiters();
  const stateWaiters = new Waiters();

  router.post(
    '/api/relays',
    asyncRoute(async (request, response) => {
      const owner = ownerId(request, config);
      if (!owner) {
        response.status(401).json({ error: 'GitHub authentication required' });
        return;
      }
      const { relay, token } = await store.createRelay(owner);
      stateWaiters.notify(owner);
      response.status(201).json({ relayId: relay.id, relayToken: token });
    })
  );

  router.put(
    '/api/relays/:id/state',
    asyncRoute(async (request, response) => {
      const relay = await store.getRelay(request.params.id);
      const token = bearerToken(request);
      if (!relay || !token || !relayTokenMatches(token, relay.tokenHash)) {
        response.status(401).json({ error: 'Invalid relay credentials' });
        return;
      }
      if (!validState(request.body)) {
        response.status(400).json({ error: 'Invalid Spec Quest protocol 1.0 state' });
        return;
      }
      await store.updateState(relay, request.body);
      stateWaiters.notify(relay.ownerId);
      response.status(204).end();
    })
  );

  router.get(
    '/api/relays/:id/actions',
    asyncRoute(async (request, response) => {
      const relay = await store.getRelay(request.params.id);
      const token = bearerToken(request);
      if (!relay || !token || !relayTokenMatches(token, relay.tokenHash)) {
        response.status(401).json({ error: 'Invalid relay credentials' });
        return;
      }
      let action = await store.nextAction(relay.id);
      if (!action && request.query.wait) {
        await actionWaiters.wait(relay.id);
        action = await store.nextAction(relay.id);
      }
      response.json({ action });
    })
  );

  router.post(
    '/api/relays/:id/actions/:actionId/ack',
    asyncRoute(async (request, response) => {
      const relay = await store.getRelay(request.params.id);
      const token = bearerToken(request);
      if (!relay || !token || !relayTokenMatches(token, relay.tokenHash)) {
        response.status(401).json({ error: 'Invalid relay credentials' });
        return;
      }
      const acknowledged = await store.acknowledgeAction(relay.id, request.params.actionId);
      response.status(acknowledged ? 204 : 404).end();
    })
  );

  const queueBrowserAction = (type: RelayActionType): RequestHandler =>
    asyncRoute(async (request, response) => {
      const owner = ownerId(request, config);
      if (!owner) {
        response.status(401).json({ error: 'GitHub authentication required' });
        return;
      }
      const relay = await store.getLatestRelay(owner);
      if (!relay || currentLevelId(store, relay) !== request.params.id) {
        response.status(409).json({ error: 'This level is no longer active' });
        return;
      }
      const payload = actionPayload(type, request.body);
      if (!payload) {
        response.status(400).json({ error: `Invalid ${type} payload` });
        return;
      }
      const action = await store.enqueueAction(relay.id, request.params.id, type, payload);
      actionWaiters.notify(relay.id);
      response.status(202).json({ queued: true, actionId: action.id });
    });

  router.post('/api/levels/:id/answer', queueBrowserAction('answer'));
  router.post('/api/levels/:id/steer', queueBrowserAction('steer'));
  router.post('/api/levels/:id/reset', queueBrowserAction('reset'));

  router.get(
    '/api/state',
    asyncRoute(async (request, response) => {
      const owner = ownerId(request, config);
      response.set('Cache-Control', 'no-store');
      if (!owner) {
        response.status(401).json({ error: 'GitHub authentication required' });
        return;
      }
      if (request.query.wait) await stateWaiters.wait(owner);
      const relay = await store.getLatestRelay(owner);
      response.json(relay ? store.parseState(relay) : { protocolVersion: '1.0.0', session: null, level: null });
    })
  );

  return router;
}

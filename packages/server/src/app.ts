import { randomBytes } from 'node:crypto';
import express from 'express';
import { publicDirectory } from '@spec-quest/level-ui';
import type { ServerConfig } from './config.js';
import { authenticateGithub, authorizationUrl } from './github.js';
import { createRelayRouter } from './relay-api.js';
import type { RelayStore } from './relay-store.js';
import { clearOauthState, clearSession, readSession, setOauthState, setSession, verifyOauthState } from './session.js';

const callbackPath = '/auth/github/callback';

function queryString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

export function createApp(config: ServerConfig, relayStore: RelayStore): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((_request, response, next) => {
    response.set({
      'Content-Security-Policy':
        "default-src 'self'; img-src 'self' data: https://avatars.githubusercontent.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    });
    next();
  });
  app.use(express.json({ limit: '1mb' }));

  app.get('/healthz', (_request, response) => response.json({ status: 'ok' }));

  app.get('/auth/github', (_request, response) => {
    const state = randomBytes(24).toString('base64url');
    setOauthState(response, state, config.sessionSecret, config.secureCookies);
    response.redirect(authorizationUrl(config.githubClientId, new URL(callbackPath, config.baseUrl).toString(), state));
  });

  app.get(callbackPath, async (request, response) => {
    const state = queryString(request.query.state);
    const code = queryString(request.query.code);
    clearOauthState(response, config.secureCookies);
    if (!state || !code || !verifyOauthState(request, state, config.sessionSecret)) {
      response.status(400).send('Invalid or expired GitHub authorization request.');
      return;
    }
    try {
      const user = await authenticateGithub(
        code,
        config.githubClientId,
        config.githubClientSecret,
        new URL(callbackPath, config.baseUrl).toString()
      );
      setSession(response, user, config.sessionSecret, config.secureCookies);
      response.redirect(config.baseUrl.pathname);
    } catch (error) {
      console.error(error);
      response.status(502).send('GitHub authentication failed. Please try again.');
    }
  });

  app.get('/api/auth/session', (request, response) => {
    const session = readSession(request, config.sessionSecret);
    response.set('Cache-Control', 'no-store');
    response.json(session ? { authenticated: true, user: session.user } : { authenticated: false });
  });

  app.post('/auth/logout', (_request, response) => {
    clearSession(response, config.secureCookies);
    response.status(204).end();
  });

  app.use(createRelayRouter(config, relayStore));

  app.use(express.static(publicDirectory));
  return app;
}

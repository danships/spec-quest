import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';

export const AUTH_COOKIE = 'specquest_session';
export const OAUTH_STATE_COOKIE = 'specquest_oauth_state';
const SESSION_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const OAUTH_STATE_LIFETIME_SECONDS = 10 * 60;

export interface GithubUser {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string;
  profileUrl: string;
}

interface SessionPayload {
  user: GithubUser;
  expiresAt: number;
}

function signature(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function seal(value: string, secret: string): string {
  return `${value}.${signature(value, secret)}`;
}

function unseal(value: string, secret: string): string | null {
  const separator = value.lastIndexOf('.');
  if (separator < 1) return null;
  const unsigned = value.slice(0, separator);
  const received = Buffer.from(value.slice(separator + 1), 'base64url');
  const expected = Buffer.from(signature(unsigned, secret), 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  return unsigned;
}

function cookies(request: Request): Map<string, string> {
  const parsed = new Map<string, string>();
  for (const entry of (request.headers.cookie ?? '').split(';')) {
    const separator = entry.indexOf('=');
    if (separator > 0) parsed.set(entry.slice(0, separator).trim(), entry.slice(separator + 1).trim());
  }
  return parsed;
}

function cookie(name: string, value: string, maximumAge: number, secure: boolean): string {
  const parts = [`${name}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maximumAge}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function setOauthState(response: Response, state: string, secret: string, secure: boolean): void {
  response.append('Set-Cookie', cookie(OAUTH_STATE_COOKIE, seal(state, secret), OAUTH_STATE_LIFETIME_SECONDS, secure));
}

export function verifyOauthState(request: Request, state: string, secret: string): boolean {
  const value = cookies(request).get(OAUTH_STATE_COOKIE);
  return !!value && unseal(value, secret) === state;
}

export function clearOauthState(response: Response, secure: boolean): void {
  response.append('Set-Cookie', cookie(OAUTH_STATE_COOKIE, '', 0, secure));
}

export function setSession(response: Response, user: GithubUser, secret: string, secure: boolean): void {
  const payload: SessionPayload = { user, expiresAt: Date.now() + SESSION_LIFETIME_SECONDS * 1000 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  response.append('Set-Cookie', cookie(AUTH_COOKIE, seal(encoded, secret), SESSION_LIFETIME_SECONDS, secure));
}

export function readSession(request: Request, secret: string): SessionPayload | null {
  const value = cookies(request).get(AUTH_COOKIE);
  if (!value) return null;
  const encoded = unseal(value, secret);
  if (!encoded) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    return payload.expiresAt > Date.now() && payload.user?.login ? payload : null;
  } catch {
    return null;
  }
}

export function clearSession(response: Response, secure: boolean): void {
  response.append('Set-Cookie', cookie(AUTH_COOKIE, '', 0, secure));
}

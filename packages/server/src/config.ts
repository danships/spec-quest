export interface ServerConfig {
  port: number;
  baseUrl: URL;
  githubClientId: string;
  githubClientSecret: string;
  sessionSecret: string;
  secureCookies: boolean;
  supersaveConnection: string;
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const baseUrl = new URL(environment.SPECQUEST_BASE_URL ?? 'http://localhost:8080');
  if (baseUrl.pathname !== '/') throw new Error('SPECQUEST_BASE_URL must not contain a path');

  const port = Number(environment.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PORT must be an integer from 1 to 65535');

  const sessionSecret = required(environment, 'SESSION_SECRET');
  if (sessionSecret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters');

  return {
    port,
    baseUrl,
    githubClientId: required(environment, 'GITHUB_CLIENT_ID'),
    githubClientSecret: required(environment, 'GITHUB_CLIENT_SECRET'),
    sessionSecret,
    secureCookies: baseUrl.protocol === 'https:',
    supersaveConnection: environment.SUPERSAVE_CONNECTION ?? 'sqlite://./.specquest/server.db',
  };
}

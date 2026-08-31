import type { GithubUser } from './session.js';

interface GithubProfile {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
}

export function authorizationUrl(clientId: string, callbackUrl: string, state: string): string {
  const url = new URL('https://github.com/login/oauth/authorize');
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: 'read:user',
    state,
  }).toString();
  return url.toString();
}

export async function authenticateGithub(
  code: string,
  clientId: string,
  clientSecret: string,
  callbackUrl: string
): Promise<GithubUser> {
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: callbackUrl }),
  });
  if (!tokenResponse.ok) throw new Error(`GitHub token exchange failed (${tokenResponse.status})`);
  const tokenBody = (await tokenResponse.json()) as { access_token?: string; error?: string };
  if (!tokenBody.access_token) throw new Error(`GitHub token exchange failed: ${tokenBody.error ?? 'no access token'}`);

  const profileResponse = await fetch('https://api.github.com/user', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${tokenBody.access_token}`,
      'User-Agent': 'spec-quest-server',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!profileResponse.ok) throw new Error(`GitHub profile request failed (${profileResponse.status})`);
  const profile = (await profileResponse.json()) as GithubProfile;
  return {
    id: profile.id,
    login: profile.login,
    name: profile.name,
    avatarUrl: profile.avatar_url,
    profileUrl: profile.html_url,
  };
}

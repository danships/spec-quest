# Spec Quest

Gamified spec generation. The agent drafts a spec; every open question becomes a
game level you answer in a local web app. The review is the boss level.

## Packages

- `packages/mcp/`: local MCP server and game state (protocol v1.0.0)
- `packages/level-ui/`: private, shared level UI used by both servers
- `packages/server/`: deployable remote server with GitHub OAuth
- `.agents/skills/spec-quest/`: the agent skill and its commands

## Quick start

```sh
pnpm install --ignore-scripts
pnpm build
node packages/mcp/dist/index.js
```

Web app: http://localhost:4477. MCP endpoint: http://localhost:4477/mcp (streamable HTTP).

In a project, run the skill's `setup` command once; it writes `specquest.md`,
`.specquest/` (gitignored) and registers the MCP server. Then run `start`.

## Remote server

Create a GitHub OAuth app whose callback URL is
`https://your-host.example/auth/github/callback`, then configure:

```sh
GITHUB_CLIENT_ID=... \
GITHUB_CLIENT_SECRET=... \
SESSION_SECRET=a-random-value-at-least-32-characters-long \
SPECQUEST_BASE_URL=https://your-host.example \
pnpm dev:server
```

`PORT` defaults to `8080`. The server provides `/healthz`, the GitHub sign-in and
logout flow, and `/api/auth/session`. Sessions are HMAC-signed, HTTP-only cookies;
production cookies are secure when `SPECQUEST_BASE_URL` uses HTTPS.

Relay state and pending player actions are stored through Supersave. SQLite is the
default backend; override its location with `SUPERSAVE_CONNECTION`:

```sh
SUPERSAVE_CONNECTION=sqlite://./.specquest/server.db
```

After signing in, choose **New relay**. The writer token is shown once. Start the
local MCP server with the generated configuration:

```sh
SPECQUEST_REMOTE_URL=https://your-host.example \
SPECQUEST_RELAY_ID=... \
SPECQUEST_RELAY_TOKEN=... \
node packages/mcp/dist/index.js
```

The MCP server publishes complete game snapshots and long-polls for persisted
answers, steers, and resets. Writer tokens are stored only as SHA-256 hashes. The
Docker image uses `/data/spec-quest.db`; mount `/data` as a persistent volume.

The CI workflow builds, lints, and runs `pnpm audit`. Pushing a `vX.Y.Z` tag builds
and publishes `ghcr.io/<owner>/<repo>-server:X.Y.Z` (and `latest`) only when the tag
matches `packages/server/package.json` and that package version differs from the
previous reachable release tag.

## Status

PoC. Shortcuts: protocol validation has limited coverage and word-search words that
do not fit the grid are silently skipped. Remote relay persistence currently targets
a single server instance; in-memory long-poll wakeups are not distributed between
replicas, although snapshots and queued actions remain durable.

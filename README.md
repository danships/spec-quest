# Spec Quest

Gamified spec generation. The agent drafts a spec; every open question becomes a
game level you answer in a local web app. The review is the boss level.

## Packages

- `.agents/skills/spec-quest/`: the agent skill and its commands (setup, start, review, implement)
- `packages/mcp/`: MCP server + web app in one Express process (protocol v1.0.0)

## Quick start

```sh
pnpm install --ignore-scripts
pnpm build
node packages/mcp/dist/index.js
# or: SPECQUEST_PORT=4477 node packages/mcp/dist/index.js
```

Web app: http://localhost:4477. MCP endpoint: http://localhost:4477/mcp (streamable HTTP).

In a project, run the skill's `setup` command once; it writes `specquest.md`,
`.specquest/` (gitignored) and registers the MCP server. Then run `start`.

## Commit checks

Installing dependencies runs Husky's `prepare` script. Before each commit, Husky
runs `pnpm lint` and `pnpm build`. Commit messages are checked against Conventional
Commits, for example `feat: add a new level type` or `fix(mcp): reject stale answers`.

## Status

PoC. The core creation/review lifecycle has standalone tests. There is no auth.
The optional online scoreboard server (`server/`) is not built yet.

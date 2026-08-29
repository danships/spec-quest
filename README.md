# Spec Quest

Gamified spec generation. The agent drafts a spec; every open question becomes a
game level you answer in a local web app. The review is the boss level.

## Packages

- `skill/`: the agent skill and its commands (setup, start, review, implement)
- `mcp/`: MCP server + web app in one Express process (protocol v1.0.0)

## Quick start

```sh
pnpm install --ignore-scripts
pnpm build
node mcp/dist/index.js        # or: SPECQUEST_PORT=4477 node mcp/dist/index.js
```

Web app: http://localhost:4477. MCP endpoint: http://localhost:4477/mcp (streamable HTTP).

In a project, run the skill's `setup` command once; it writes `specquest.md`,
`.specquest/` (gitignored) and registers the MCP server. Then run `start`.

## Status

PoC. Shortcuts: happy path focus, no tests yet (protocol validation is the first
candidate), no auth, word-search words that do not fit the grid are silently skipped.
The optional online scoreboard server (`server/`) is not built yet.

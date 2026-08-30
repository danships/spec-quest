---
description: Prepare this project for Spec Quest
---

# Spec Quest: setup

Prepare the current project. Do all of the following:

1. Ask the user which port the MCP server should use if not obvious. Default: 4477.
2. Write `specquest.md` at the repo root with these sections, adapted to this project:
   - **Spec format**: the sections a finished spec must contain for this project.
     Default: Overview, Requirements, Non-goals, Architecture, Data, Edge cases, Open risks.
     Inspect the repo (stack, conventions, existing specs) and adjust the format to fit.
   - **Validation**: the checks the review (boss level) runs against a draft spec.
     Default: every requirement is testable; no section is empty; edge cases cover
     failure paths; decisions record their alternatives.
   - **MCP server**: the port, and that the server must be running before `start`.
   - **Starting the app**: `npx spec-quest-mcp` (env `SPECQUEST_PORT=<port>`), web app
     at `http://localhost:<port>`.
3. Create the `.specquest/` folder and add `.specquest/` to `.gitignore` if missing.
4. Register the MCP server for the agent host(s) used by the project. Merge existing
   configuration instead of overwriting it.

   For Codex, add this to project-scoped `.codex/config.toml`:

   ```toml
   [mcp_servers.spec-quest]
   url = "http://localhost:<port>/mcp"
   tool_timeout_sec = 35
   ```

   For Claude Code, add this to `.mcp.json`:

   ```json
   {
     "mcpServers": {
       "spec-quest": { "type": "http", "url": "http://localhost:<port>/mcp" }
     }
   }
   ```

5. Tell the user: setup is done. Start the server from the project root with
   `SPECQUEST_PORT=<port> npx spec-quest-mcp`, restart the agent host so it loads the
   new MCP configuration, open the web app in a browser tab, then run the start command.
   A phone cannot use the computer's `localhost`; do not suggest phone access until a
   separately secured LAN mode is available.

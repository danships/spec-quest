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
4. Register the MCP server for this project. For Claude Code, write `.mcp.json`:

   ```json
   {
     "mcpServers": {
       "spec-quest": { "type": "http", "url": "http://localhost:<port>/mcp" }
     }
   }
   ```

   Merge with an existing `.mcp.json` instead of overwriting it.

5. Tell the user: setup is done, start the server with `npx spec-quest-mcp`, open the
   web app on their phone or a browser tab, then run the start command.

# Spec Quest improvement analysis

## Current baseline

The standalone creation and review workflow is covered by an end-to-end test using
the feature **Offline action queue**. The test performs the protocol handshake,
starts a session, answers and steers normal levels, resolves a boss review, writes a
finished spec, and completes the session through the MCP and browser HTTP APIs.

The current regression suite passes six tests. Build, lint, formatting, and the
local package artifact also pass their checks.

## Recommended improvements

### 1. Automate and test project setup

Replace the instruction-only setup workflow with an idempotent setup command or
script. It should:

- Detect the active agent host and update the appropriate configuration.
- Safely merge project-scoped Codex `.codex/config.toml` and Claude Code `.mcp.json`
  without replacing unrelated servers or settings.
- Add `.specquest/` to `.gitignore` without duplicate entries.
- Generate or update `specquest.md` without destroying intentional customization.
- Preserve the selected port everywhere, including the startup command.
- Explain that the agent host must be restarted after MCP configuration changes.
- Validate malformed configuration and provide a recoverable error.

Add fixture-based tests for empty, existing, malformed, and repeatedly configured
projects.

### 2. Add a secure phone and LAN mode

The server now binds to loopback by default because its MCP and mutation endpoints
have no authentication. Before advertising phone access, add an explicit LAN mode
with:

- A short-lived pairing code or session token.
- Authentication on MCP and every state-changing browser endpoint.
- A displayed LAN URL instead of `localhost`.
- Clear host/firewall guidance and an explicit opt-in flag.
- Tests proving unauthenticated requests are rejected.

Loopback should remain the default.

### 3. Improve testability of the server architecture — completed

Express application construction is now separate from CLI startup. `createApp`
receives an isolated `SpecQuestState`, while the CLI only reads environment settings,
restores state, and binds the listener. A null state directory provides an in-memory
store; a temporary or production directory provides persistence.

The standalone test now calls `app.listen(0)` in-process and uses the assigned
ephemeral port. It no longer orchestrates a child process or reserves a fixed port,
and a dedicated regression verifies that stores are isolated and persisted sessions
can be restored.

### 4. Expand protocol validation and limits

The server now validates answer references and boss resolution completeness. Extend
that coverage with:

- Explicit maximum item and text sizes for every level type.
- A documented decision on whether `match_pairs` is one-to-one or many-to-one.
- Discriminated payload and answer schemas for each level type instead of a generic
  record at the MCP boundary.
- Table-driven tests for every valid payload and answer, plus missing, duplicate,
  unknown, and extra identifiers.
- A documented protocol-version policy for compatible fixes and breaking changes.

### 5. Test all browser renderers

Add DOM-level tests for all twelve level types, covering:

- Submitted answer shape and completeness.
- Reset and steer behavior.
- Empty and populated boss reviews.
- Reload behavior during a partially completed boss fight.
- Keyboard navigation, focus management, labels, and screen-reader output.
- Narrow phone-sized layouts without requiring LAN access.

Partial boss progress should be recoverable after a refresh rather than restarting
the entire review.

### 6. Strengthen spec quality checks

Make the review checklist machine-checkable where practical:

- Require stable requirement identifiers.
- Trace each requirement to at least one measurable acceptance test.
- Check that failure and recovery paths are present.
- Require important decisions to record considered alternatives.
- Record rejected findings as explicit waivers in the configured risks or decisions
  section.
- Require a new boss review whenever post-review answers change the draft.

Clean reviews should remain valid; the workflow must not invent findings merely to
reach a target count.

### 7. Verify the published installation path

The locally packed `spec-quest-mcp` artifact contains the executable, compiled
server, and browser assets. Add CI that publishes to a temporary registry or installs
the packed artifact into a clean consumer fixture, then runs the documented
`npx spec-quest-mcp` command. After release, add a registry smoke test so setup does
not depend solely on workspace execution.

### 8. Improve operational diagnostics

Add a startup or health diagnostic that reports:

- Protocol and package versions.
- Bind host, port, and state directory.
- Whether the state directory is writable.
- Whether a restored session is active or finished.
- A clear warning when binding beyond loopback without authentication.

The setup workflow should call this diagnostic before starting the first quest and
turn common port, permission, and protocol mismatches into actionable messages.

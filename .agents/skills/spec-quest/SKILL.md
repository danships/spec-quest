---
name: spec-quest
description: Gamified spec generation. Use when the user wants to create a feature spec through Spec Quest, mentions spec quest, or runs the setup, start, review, or implement commands. Turns every open spec question into a game level the user answers in a local web app.
---

# Spec Quest

Spec Quest turns the spec phase into a game. You (the agent) draft the spec. Every open
question becomes a game level. The developer answers the levels in a local web app.
The review step is the boss level. Skill version: 0.1.0. Protocol version: **1.0.0**.

## How it works

1. A local MCP server (`spec-quest`) serves the game web app and exposes tools to you.
2. You call `specquest_start_session`, then present one open question at a time with
   `specquest_create_level`, and wait for the answer with `specquest_check_level`.
3. Answers flow into the spec draft. When no open questions remain, run the review
   as a `boss` level, then `specquest_finish_session`.

Before the first level, call `specquest_info` and verify `protocolVersion` equals
**1.0.0**. If it does not match, stop and tell the user to update the skill or the
MCP server so the versions align.

## Project configuration

Each project has a `specquest.md` at the repo root (written by the setup command).
It defines: the spec contents format, the validation rules for the review, the MCP
server port, and how to start the app. Always read `specquest.md` before starting a
session and follow its spec format exactly.

Session state lives in `.specquest/` (gitignored). Never edit those files by hand.

## Writing good levels

- One level per open question. Keep prompts short; the player is on a phone.
- Pick the level type that matches the answer shape. You decide; the protocol does
  not enforce selection rules:
  - one option out of a few: `doors` (2-4 options) or `word_search` (short words)
  - a batch of small yes/no calls: `this_or_that`
  - multi-select from a list: `highlight_words` (in-scope parts) or `loot_chest` (features)
  - mapping A to B: `match_pairs`
  - ranking or ordering: `sort_order`
  - triage into categories: `bucket_toss` (for example must / should / won't)
  - a single word, name, or number: `fill_the_rune`
  - anything free-form: `riddle` (the fallback)
  - a confirmation check on a drafted part: `spot_the_bug` (plant exactly one real flaw)
  - the review: `boss` (one finding per review point)
- Vary the level types across a session. Repetition kills the game.
- A `steered` status means the player sent free text to redirect you. Adjust and
  create a new level (or incorporate the steer and move on). Never ignore a steer.
- Resets and steers are free for the player. Do not discourage them.

## Commands

- `setup`: prepare a project for Spec Quest (see commands/setup.md)
- `start`: run a spec session (see commands/start.md)
- `review`: run the boss level on an existing spec (see commands/review.md)
- `implement`: implement the finished spec with a sub-agent (see commands/implement.md)

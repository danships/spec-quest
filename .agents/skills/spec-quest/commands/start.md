---
description: Run a Spec Quest session for a feature
---

# Spec Quest: start

Run a full spec session for the feature the user names. If no feature was given, ask.

1. Read `specquest.md`. Follow its spec format and validation rules.
2. Call `specquest_info`. Verify the protocol version is 1.0.0 and the server responds.
   If the server is unreachable, tell the user to run `npx spec-quest-mcp` first.
3. Call `specquest_start_session` with a short title, your model identifier as
   `agentModel`, and `skillVersion` 0.1.0.
4. Draft the spec. Collect every open question: decisions you cannot make from the
   codebase, requirements only the user knows, scope calls, priorities.
5. For each open question, one at a time:
   - pick a fitting level type (see SKILL.md) and call `specquest_create_level`
   - call `specquest_check_level` until it returns `answered` or `steered`
     (`pending` means call again; it long-polls 25 seconds per call)
   - on `answered`: work the answer into the spec draft
   - on `steered`: follow the steer text, then create a replacement level or move on
6. While waiting you may keep drafting the parts that do not depend on open answers.
7. When no open questions remain, run the review from commands/review.md.
8. Write the finished spec to the location the project uses for specs (or
   `specs/<feature>.md` if none exists) in the `specquest.md` format.
9. Call `specquest_finish_session` with the spec path and show the user the final
   score summary.

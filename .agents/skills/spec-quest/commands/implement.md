---
description: Implement a finished Spec Quest spec
---

# Spec Quest: implement

Implement the spec produced by a finished session.

1. Locate the spec: the path from `specquest_finish_session`, or ask the user.
2. Launch a sub-agent with a fresh context. Give it only:
   - the spec file
   - `specquest.md` (for project conventions it references)
   - the instruction to implement the spec exactly, and to report anything in the
     spec that turns out to be impossible or ambiguous instead of improvising
3. Do not pass the session history or the game state to the sub-agent. The spec is
   the single source of truth; that is the point of Spec Quest.
4. When the sub-agent reports back, verify the result against the spec and summarize
   for the user what was built and what deviated.

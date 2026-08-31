---
description: Run the Spec Quest boss level (spec review)
---

# Spec Quest: review

Run the review as a boss fight. Works inside a running session, or standalone on an
existing spec file (start a session first in that case).

1. Read `specquest.md` and apply its validation rules to the spec draft. For a
   standalone review, first call `specquest_info`, verify protocol 1.0.0, then call
   `specquest_start_session` with the spec title, model identifier, and skill 0.1.0.
2. Review the draft critically. Trace every requirement to a measurable acceptance
   check, then inspect contradictions, failure/recovery paths, alternatives, and risky
   assumptions. Each finding is one clear sentence that identifies the location and
   impact and proposes a concrete spec edit. Prefer 3-8 substantive findings; do not
   invent findings. An empty findings list is valid after the full checklist passes.
3. Call `specquest_create_level` with type `boss` and the findings.
4. Call `specquest_check_level` until answered. Apply each resolution:
   - `accept`: fix the finding in the spec yourself
   - `reject`: leave it as is; record the rejection in the configured risks/decisions section
   - `correct`: apply the player's correction text
5. If corrections raise new open questions, run them as normal levels, apply the
   answers, then repeat the review on the changed draft.
6. Re-run every configured validation rule, write the updated spec back to its original
   path, and call `specquest_finish_session` with that path. Show the score summary.

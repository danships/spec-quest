---
description: Run the Spec Quest boss level (spec review)
---

# Spec Quest: review

Run the review as a boss fight. Works inside a running session, or standalone on an
existing spec file (start a session first in that case).

1. Read `specquest.md` and apply its validation rules to the spec draft.
2. Review the draft critically. Produce findings: gaps, contradictions, untestable
   requirements, missing edge cases, risky assumptions. Each finding is one clear
   sentence. Aim for 3-8 findings; a spec with zero findings was not reviewed hard enough.
3. Call `specquest_create_level` with type `boss` and the findings.
4. Call `specquest_check_level` until answered. Apply each resolution:
   - `accept`: fix the finding in the spec yourself
   - `reject`: leave it as is; note the rejection in the spec's Open risks section
   - `correct`: apply the player's correction text
5. If corrections raise new open questions, run them as normal levels before finishing.

---
type: llm
criteria: "The final message reports the URL of the existing open PR for feat/42-*, states that no second PR was created and nothing was pushed, and describes only reconciling the label and/or ship:pr comment — not opening a new PR."
target: last_message
---

# Rubric: idempotent re-run reconciles, does not duplicate

This fixture starts with ticket 42 already `ship:pr-open` and an open PR
(`#7`) already existing for `feat/42-csv-export`. Per opening-prs/SKILL.md
Step 4, `/pr` must:
- report that PR's URL;
- create no second PR;
- push nothing;
- only reconcile the label and/or the `ship:pr` comment (e.g. posting the
  `ship:pr opened <url>` comment if a trusted one was not already on the
  trail, since this fixture's board history has none).

Score PASS if the final message reports PR #7's existing URL, is explicit
that no new PR was opened and nothing was pushed, and frames the work
done (if any) as reconciling label/comment state rather than as opening
a PR "for the first time."

Score FAIL if the message implies a new PR was created, is silent about
the existing PR's URL, or claims a push happened.

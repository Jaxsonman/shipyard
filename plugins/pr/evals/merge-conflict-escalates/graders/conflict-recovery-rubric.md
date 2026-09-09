---
type: llm
criteria: "The final message states that the branch does not merge cleanly, that nothing was pushed and no PR was opened, and spells out the exact two-step recovery: resolve the merge by hand, then restore ship:approved (removing ship:needs-human) and re-run /pr 42."
target: last_message
---

# Rubric: escalation summary and recovery path

Per `skills/opening-prs/SKILL.md` Step 3, a merge-tree conflict is not the
usual Needs Human reset to `ship:planned` — the review packet was already
approved, only the merge failed. The recovery is: rebase or merge the base
into the branch by hand, then restore `ship:approved` (removing
`ship:needs-human`) and re-run `/pr 42`.

Score PASS only if the final message:
- States the branch does not merge cleanly into main.
- States that nothing was pushed and no PR was opened.
- Spells out both recovery steps in the assistant's own summary (not just
  buried in the board comment): resolving the conflict by hand, and then
  restoring `ship:approved` / removing `ship:needs-human` before
  re-running `/pr 42` — not the generic "reset to ship:planned" Needs
  Human recovery used elsewhere in the pipeline.
- Reports the label swap to `ship:needs-human` actually happened.

Score FAIL if the message omits the recovery steps, describes the wrong
recovery (e.g. resetting to `ship:planned`), claims a push or PR happened,
or is vague about what failed.

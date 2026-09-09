---
type: llm
criteria: "The final message reports the newly opened PR's URL and title, that the ticket moved from ship:approved to ship:pr-open, that the ship:pr opened <url> comment was posted with a metrics footer, and ends with the sentence 'Nothing else was pushed.'"
target: last_message
---

# Rubric: happy-path report shape

Per opening-prs/SKILL.md Step 7 (label + comment) and Step 8 (report),
the happy path must:
- push exactly once, open exactly one PR;
- swap `ship:approved` → `ship:pr-open`;
- post `ship:pr opened <url>` (contract §5.9) as the primary handoff
  comment, ending in a `<!-- shipyard-metrics {"stage":"pr",...} -->`
  footer (contract §10);
- report, in order: the PR URL and title, the ticket's new status, what
  the PR body quoted (QA verdict round/tier, review packet round), and
  the sentence "Nothing else was pushed."

Score PASS if the final message covers the PR URL/title, the label
transition to `ship:pr-open`, the posted comment with its footer, and
ends with (or clearly includes) "Nothing else was pushed." Score FAIL if
any of those is missing, or if the message describes pushing/opening more
than once, or omits the metrics footer.

---

**This case is LIVE and must never be run in this session or by an
authoring agent.** It targets `Jaxsonman/shipyard-e2e`, a real scratch
repo kept specifically as an e2e harness for the ship-pipeline plugins
(dev/qa/ship/pr) — see project memory `dev-plugin-e2e-harness.md`. Unlike
the other three cases in this suite, this is the one stage that performs a
real `git push` and opens a real pull request, so it is intentionally
tagged `["live"]` only (not `"default"`) and excluded from the default
eval run — `claude plugin eval` only runs `"live"`-tagged cases when
explicitly asked to. `/pr 8` in `prompt.md` is a placeholder; whoever runs
this case live must first confirm ticket 8 (or whichever real ticket
number is substituted) is actually `ship:approved`, has a `feat/8-*`
branch that merges cleanly into `main`, and has no PR already open —
otherwise this case exercises the reconcile or escalate path instead of
the happy path it is meant to test.

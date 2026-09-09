---
type: regex
pattern: "Closes #8"
flags: ""
match: contains
target: trace
---

Per opening-prs/SKILL.md Step 6, the PR body template's first line is
`Closes #<id>` — the mechanism by which the issue closes when the PR
merges. This checks the literal `Closes #8` text appears in the tool
trace (the temp file written before `gh pr create --body-file`) or, at
minimum, that the assistant surfaces it in its final report.

NOTE FOR WHOEVER RUNS THIS CASE: `8` is a placeholder ticket number.
Before running this case for real, replace both `/pr 8` in `prompt.md`
and `Closes #8` here with the number of an actual `ship:approved` ticket
on `Jaxsonman/shipyard-e2e` whose branch merges cleanly and has no open
PR yet.

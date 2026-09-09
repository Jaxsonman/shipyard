---
type: regex
pattern: "ship:qa verdict (PASS|FAIL) (round \\d+/\\d+|standalone) tier=\\w+(\\([^)]*\\))? verified \\d+/\\d+"
flags: ""
match: contains
target: last_message
---

Contract §5.5 defines the QA verdict header grammar exactly:
`ship:qa verdict <VERDICT> round N/M tier=<tier> verified k/n`, or for a
standalone invocation, `round N/M` replaced by the literal word
`standalone`. This is a standalone `/qa 9` run with a genuine regression
built into the fixture (see setup.sh: `discount.js` is correct on `main`
but broken on `feat/9-add-discount-code`), so the verdict must be `FAIL`,
but this grader accepts either `PASS` or `FAIL` and any tier, since it is
checking the header *shape*, not this case's specific outcome (that is
covered by other graders / the suite's regression-detection behavior
itself).

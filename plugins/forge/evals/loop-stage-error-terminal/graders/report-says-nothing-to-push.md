---
type: regex
pattern: "no commits to push"
flags: ""
match: contains
target: {source: file, path: ".forge/broken-json-app/run/report.md"}
---

`report.md` must be written even though no PR was opened, and its
section 6 must say why rather than leaving `PR: (pending)` or claiming a
creation failure that never happened. The documented line is
`PR: none — no commits to push (cause: stage-error:developer)`; this
grader asserts the load-bearing phrase `no commits to push` reached the
file. A report that omits it has hidden the real outcome from whoever
reads the run afterwards.

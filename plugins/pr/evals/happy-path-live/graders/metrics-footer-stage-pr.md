---
type: regex
pattern: "\"stage\":\"pr\""
flags: ""
match: contains
target: trace
---

Contract §10's footer is a single-line HTML comment carrying JSON whose
first key is `stage`. Step 7 appends
`node metrics.js footer --stage pr ...` as the last line of the
`ship:pr opened <url>` comment. This checks the literal `"stage":"pr"`
substring appears (in the temp file content for the comment, or the
metrics.js invocation's output) somewhere in the tool trace.

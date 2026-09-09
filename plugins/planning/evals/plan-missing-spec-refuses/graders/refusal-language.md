---
type: regex
pattern: "spec\\.md|/spec 42|run\\s+/spec|has(n't| not) (been )?spec|not (yet )?spec'?d"
flags: "i"
match: contains
target: last_message
---

Per `planning-tickets` SKILL.md Step 2, `docs/ship/<id>/spec.md` must
exist before planning proceeds — its absence is stated as "File presence
is the gate," and the user is told to run `/spec <id>` first. This is a
loose regex backstop for that refusal wording; the LLM grader below is the
real check.

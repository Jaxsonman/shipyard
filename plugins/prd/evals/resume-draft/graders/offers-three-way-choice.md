---
type: regex
pattern: "(resume|continue).{0,80}(start over|restart).{0,80}(ignore|new)|(ignore|new).{0,80}(resume|continue).{0,80}(start over|restart)"
flags: "i"
match: contains
target: last_message
---
The response must lay out the three-way choice from the writing-prds skill
(resume the existing draft / start over by deleting it / ignore and start a
new PRD) rather than silently launching a fresh interview. This is a loose
regex backstop for the "resume vs start over vs ignore" language; the LLM
grader below is the real check.

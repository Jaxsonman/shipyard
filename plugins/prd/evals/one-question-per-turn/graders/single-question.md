---
type: llm
criteria: "The assistant's final message reflects/restates the idea in one sentence and then asks exactly one interview question, without batching multiple questions."
target: last_message
---
The `/prd` command instructs: when an idea is given, restate it in one
sentence to confirm understanding, then begin the interview; the
writing-prds skill's interview rule is to ask exactly ONE question per
message and never batch questions.

Pass criteria for the final message of this turn:
- It restates/reflects the "dark mode toggle" idea in roughly one sentence
  before asking anything (a short confirmation of understanding).
- It then asks exactly one question (about the problem/who it hurts most,
  per interview area 1 — "Problem").
- It does not ask two or more distinct questions in the same message (e.g.
  it must not ask about the problem AND target users AND success metrics
  all at once, and must not present a numbered/bulleted list of several
  separate questions).
- Offering 3-4 multiple-choice options as *answers to the single question*
  is fine and expected — that is not "batching questions"; only asking
  about more than one interview area in the same message counts as a fail.

Fail if the message skips restating the idea, asks zero questions, or asks
more than one distinct question.

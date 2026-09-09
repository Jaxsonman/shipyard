---
type: regex
pattern: "already exists|revise|new slug|abort"
flags: "i"
match: contains
target: last_message
---
A finished (non-draft) PRD already exists at `docs/prd/2026-08-01-dark-mode.md`
for the same "dark-mode" slug the new idea derives. Per the writing-prds
skill, the agent must stop and ask the user to revise the existing PRD,
supply a new slug, or abort — never silently overwrite or create a second
file. This checks for that refusal-style language in the final message.

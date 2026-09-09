---
type: regex
pattern: "verdict"
flags: "i"
match: contains
target: last_message
---

A ship-invoked run's final message must be a verdict (or, per the skill's
error envelope, an explicit `error` object) — never silence, and never a
question left hanging. This is a light sanity check that the run actually
concluded with verdict-shaped output rather than trailing off.

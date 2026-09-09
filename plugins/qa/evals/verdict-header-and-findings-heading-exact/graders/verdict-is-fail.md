---
type: regex
pattern: "ship:qa verdict FAIL"
flags: ""
match: contains
target: last_message
---

The fixture's `discount.js` is correct on `main` (the merge-base) and
broken on `feat/9-add-discount-code` — a deliberate, deterministic
regression per contract §5, decision 4 / the skill's Step 5 classification
rule ("passes on base → regression: becomes a finding"). Per contract §6,
any regression finding forces `FAIL`. This checks the header's verdict
value is exactly `FAIL`, not `PASS`.

---
type: regex
pattern: "## Findings"
flags: ""
match: contains
target: last_message
---

Contract section 5.5 says the literal heading "## Findings" is load-bearing:
dev's round-N+1 fix-list parse reads exactly that heading. This fixture
has a genuine regression (the discount bug), so the verdict body must
include a non-empty Findings section using this exact Markdown heading —
not "Findings:", not "### Findings", not a renamed section.

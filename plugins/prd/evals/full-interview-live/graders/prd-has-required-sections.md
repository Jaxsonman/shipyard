---
type: llm
criteria: "docs/prd/*.md contains a complete PRD with every section the writing-prds template requires, each with real (non-placeholder) content."
target: {source: file, path: "docs/prd/*.md"}
---
The writing-prds skill's template requires, in order, these sections:

```
# PRD: <Product/Feature Name>
**Date:** / **Status:** / (optional **Author:**)
## Problem
## Target users
## Success metrics
## Scope — v1 (in)
## Scope — explicitly out
## Functional requirements
## Risks & open questions
```

Pass criteria:
- All of the above sections are present, in that order.
- Each section has substantive, specific content grounded in the simulated
  interview answers — not placeholder/template text like "<Capability 1>".
- Success metrics are measurable (numbers or clearly quantifiable outcomes).
- Functional requirements are numbered, testable sentences tied to the
  scope-in capabilities.
- The file is NOT a `.draft.md` — it should read as a finished PRD, not a
  partial draft with a trailing `<!-- prd-draft: next=... -->` marker.

Fail if any required section is missing, empty, or still contains template
placeholder text, or if the file is clearly an unfinished draft.

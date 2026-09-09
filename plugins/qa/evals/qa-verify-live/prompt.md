---
name: "Live QA verification against a real ticket/branch (live, un-mocked)"
tags: ["live"]
runs: 1
max_turns: 20
timeout_seconds: 900
---

This case is intentionally un-mocked, real-infrastructure, and excluded
from the default eval run: it runs a real QA verification pass — real
headless-browser E2E, a real health check against a running app, real
board comment I/O — against a real ticket and branch on the
`Jaxsonman/shipyard-e2e` scratch repository. It only runs when the suite
is invoked with `--tag live`, and it is the only case in this suite tagged
`live`.

AUTHORING NOTE (not part of the live prompt itself): the authoring agent
for this eval suite must NOT execute this case and must NOT run
`claude plugin eval` in this session under any circumstances, regardless
of tag — author the files only.

Run standalone QA verification:

/qa <the ticket id or branch supplied by whoever configured this live run>

---
type: llm
criteria: "The response reports that round 2's QA findings were identical to round 1's (no progress made on finding qa-1-1), that the run stopped early with cause no-progress rather than continuing to round 3 (devQaCap is 3, so a plain FAIL would normally continue), and that a draft, not-passed PR was opened."
focus: last_message
---

Per `skills/running-forge/SKILL.md` Step 3's oscillation guard B, a
byte-identical report two rounds in a row stops the run immediately
(Terminal, draft, cause `no-progress`) even though `devQaCap` (3) has
not been reached (round 2 < 3). Score FAIL if the response says round 3
ran or will run, or does not name `no-progress` as the reason.

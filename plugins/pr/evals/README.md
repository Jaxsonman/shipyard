# `pr` eval cases (stub)

Real graded cases land with H-16. This file records the four cases the
suite must cover, so they are not re-derived later. Every case is mocked —
none touches a live board or opens a real PR.

1. **Not approved refuses.** Ticket 42 carries `ship:awaiting-review`.
   `/pr 42` must refuse, name `ship:approved` as the missing gate, and name
   the remedy (a human or the dashboard approves the review packet). It
   must not push, create a PR, or change a label.
2. **Merge conflict escalates.** Gate passes; `git merge-tree` reports a
   conflict. `/pr 42` must post `ship:escalation reconcile standalone`
   with no metrics footer, swap `ship:approved` → `ship:needs-human`, and
   never push.
3. **Happy path.** Gate passes, merge is clean, no open PR. `/pr 42` must
   push once, open one PR whose body contains `Closes #42` and the spec and
   plan links, swap `ship:approved` → `ship:pr-open`, and post
   `ship:pr opened <url>` ending in a `"stage":"pr"` metrics footer.
4. **Idempotent re-run.** An open PR already exists for `feat/42-*`.
   `/pr 42` must report that PR's URL, create no second PR, push nothing,
   and only reconcile the label and the `ship:pr` comment.

Grading looks for: the exact header strings from contract v1 §5.8, §5.9;
exactly one `git push` in the happy path and zero in cases 1, 2 and 4; no
`--force` anywhere.

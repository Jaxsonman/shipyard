# GitHub backend

Used when `config.backend` is `"github"`. `config.target` is `owner/repo`.

## Auth check

Before the first call in a session, verify auth:

```bash
gh auth status
```

If this fails, tell the user to run `gh auth login` and stop — do not
attempt to create or search issues without valid auth.

## Search for duplicates (Step 4 of SKILL.md)

```bash
gh issue list --repo <owner/repo> --search "Source PRD: <slug> in:body" --state all --json number,title,url
```

Parse the JSON array. If it's non-empty, those are the matches to report to
the user.

## Create a ticket (Step 6 of SKILL.md)

```bash
gh issue create --repo <owner/repo> --title "<title>" --body "<body>"
```

`<body>` is the full ticket template from SKILL.md Step 3 (Description /
Acceptance Criteria / How to verify / Source PRD line), passed as a single
shell argument — write it to a temp file and use `--body-file <path>` if the
body contains characters that are awkward to escape inline:

```bash
gh issue create --repo <owner/repo> --title "<title>" --body-file <temp-file-path>
```

On success, `gh issue create` prints the created issue's URL on stdout —
that is the URL to record for the Step 7 summary.

On failure (non-zero exit), capture stderr as the error reason for the Step
7 summary and continue to the next ticket.

## List open tickets (Step 3 of SKILL.md)

```bash
gh issue list --repo <owner/repo> --state open --json number,title
```

Parse the JSON array; each entry's `number` is the ref (`#<number>`) used
in `Depends on:` lines, and the titles are what Step 3 scans when deciding
whether a new slice plausibly builds on existing work.

## Verify a ticket exists (Step 5 of SKILL.md)

```bash
gh issue view <number> --repo <owner/repo> --json number,title,state
```

A zero exit confirms the ref exists; any state counts — a dependency on a
closed ticket is already satisfied. A non-zero exit means the ref is wrong
and must be fixed or removed at the gate.

# GitHub backend

Used when `config.backend` is `"github"`. `config.target` is `owner/repo`.

## Auth check

Before the first call in a session, verify auth:

```bash
gh auth status
```

If this fails, tell the user to run `gh auth login` and stop — do not
attempt to create or search issues without valid auth.

## List tickets for duplicate detection (Step 4 of SKILL.md)

```bash
gh issue list --repo <owner/repo> --state all --limit 1000 --json number,title,url,body
```

If exactly 1000 issues come back, the list was truncated — say so to the
user, then page: repeat with `--state all --limit 1000` plus a
`created:<YYYY-MM-DD..YYYY-MM-DD>` date-window qualifier, narrowing the
window until a page comes back short of 1000. Never combine the window with
`in:body` or any other body/text search qualifier — those tokenize on the
colon and return wrong results. Never report "no duplicates found" from a
page that was truncated.

Filter the returned JSON **locally** for issues whose body contains a line
exactly `Source PRD: <slug>`. Do not put that string in `--search` with
`in:body` — GitHub's search tokenizes on the colon and the result is wrong.

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

## Verify a ticket exists (Step 3 of SKILL.md)

```bash
gh issue view <number> --repo <owner/repo> --json number,title,state
```

A zero exit confirms the ref exists; any state counts — a dependency on a
closed ticket is already satisfied. A non-zero exit means the ref is wrong
and must be fixed or removed at the gate.

Also used at the Step 5 gate, to verify any existing-board ref the user adds
there.

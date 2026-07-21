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

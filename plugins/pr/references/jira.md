# Jira backend — board operations (pipeline exit, best-effort)

Used when `config.backend` is `"jira"`. `config.target` is a Jira project
key (e.g. `PROJ`). The ticket id `<id>` is the issue key (e.g. `PROJ-12`);
accept a bare key or a `…atlassian.net/browse/PROJ-12` URL.

**Best-effort.** Per contract §2, GitHub is the fully supported backend.
On Jira, `pr` manages the *ticket* through the Atlassian MCP server while
the pull request itself is still opened on the git host with `gh` (see
`${CLAUDE_PLUGIN_ROOT}/references/github.md` § Push the branch, § Find an
existing PR, § Open the PR). Say this to the user before the first Jira
call. Jira comments carry **no metrics footer** (§2, §10).

This plugin bundles its own Atlassian remote MCP server (see
`plugins/pr/.mcp.json`). Its tools appear scoped as
`mcp__plugin_pr_atlassian__<toolName>`. The first call in a session
triggers a one-time OAuth prompt — if a tool call returns an auth/consent
error, tell the user to complete that prompt and retry.

## Auth check

There is no separate auth probe; the first tool call doubles as the check.

## Fetch ticket

Call `mcp__plugin_pr_atlassian__getJiraIssue` with:

```json
{ "issueIdOrKey": "<id>" }
```

A tool error (not found, no access) → report the error message verbatim and
stop.

## Read status

Prefer the issue's real workflow status, matched case-insensitively with the
close variants listed in `${CLAUDE_PLUGIN_ROOT}/references/contract.md` §4
("Jira equivalent"). Fall back to the hyphenated labels — `ship-approved`,
`ship-pr-open`, `ship-needs-human` — when the workflow has no matching
status, and tell the user that is what you did.

`pr` runs only on Approved / `ship-approved`.

## List approved tickets

Call `mcp__plugin_pr_atlassian__searchJiraIssuesUsingJql` with:

```json
{ "jql": "project = <config.target> AND (status = \"Approved\" OR labels = ship-approved) AND statusCategory != Done ORDER BY created ASC" }
```

## Post comment

Call `mcp__plugin_pr_atlassian__addCommentToJiraIssue` with:

```json
{ "issueIdOrKey": "<id>", "commentBody": "<comment markdown>" }
```

Omit the metrics footer — Jira never carries one.

## Set status

Prefer a real workflow transition:

1. Call `mcp__plugin_pr_atlassian__getTransitionsForJiraIssue`
   (`{"issueIdOrKey": "<id>"}`).
2. Look for a transition whose target status name matches PR Open (or Needs
   Human / Blocked for the escalation path), case-insensitively, accepting
   the close variants in contract §4.
3. If found, call `mcp__plugin_pr_atlassian__transitionJiraIssue` with that
   transition's id.
4. **If no transition matches**, tell the user their workflow has no
   matching status and fall back to labels via
   `mcp__plugin_pr_atlassian__editJiraIssue`: add `ship-pr-open` (or
   `ship-needs-human`) and remove `ship-approved`. Never silently fail and
   never skip the user-facing explanation.

## Trust and board reading

`board-trail.js` parses GitHub comment JSON. On Jira, read the QA verdict
and review packet by hand from the fetched comments and **tell the user the
trust rule (§3) could not be enforced mechanically** — name the comment
authors you relied on so a human can judge them.

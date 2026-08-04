# Jira backend — board operations (comment-only)

Used when `config.backend` is `"jira"`. `config.target` is a Jira project
key (e.g. `PROJ`). The ticket id `<id>` is the issue key (e.g. `PROJ-12`);
accept a bare key or a `…atlassian.net/browse/PROJ-12` URL.

**This plugin never changes ticket status or labels.** Only ship
transitions tickets. These are the only board operations dev performs.

This plugin bundles its own Atlassian remote MCP server (see
`plugins/dev/.mcp.json`). Its tools appear scoped as
`mcp__plugin_dev_atlassian__<toolName>`. The first call in a session
triggers a one-time OAuth prompt — if a tool call returns an auth/consent
error, tell the user to complete that prompt and retry.

## Auth check

There is no separate auth probe; the first tool call doubles as the check
(see OAuth note above).

## Fetch ticket

Call `mcp__plugin_dev_atlassian__getJiraIssue` with:

```json
{ "issueIdOrKey": "<id>" }
```

The result includes summary, description, status, labels, and comments —
comments are where the skill reads `ship:*` structured headers. A tool
error (not found, no access) → report the error message verbatim and stop.

## Post comment

Call `mcp__plugin_dev_atlassian__addCommentToJiraIssue` with:

```json
{ "issueIdOrKey": "<id>", "commentBody": "<comment markdown>" }
```

A tool error → report it verbatim; the skill's handoff fallback (write the
report to `docs/ship/<id>/`) handles preservation.

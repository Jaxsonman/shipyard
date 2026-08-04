# Jira backend — board operations (comment-only)

QA is a pure worker: it reads tickets and posts comments. There is
deliberately **no set-status / transition operation** in this file — only
ship transitions tickets (design decision 6). Do not add one.

Used when `config.backend` is `"jira"`. `config.target` is a Jira project
key (e.g. `PROJ`). The ticket id `<id>` is the issue key (e.g. `PROJ-12`);
accept a bare key or a `…atlassian.net/browse/PROJ-12` URL.

This plugin bundles its own Atlassian remote MCP server (see
`plugins/qa/.mcp.json`). Its tools appear scoped as
`mcp__plugin_qa_atlassian__<toolName>`. The first call in a session
triggers a one-time OAuth prompt — if a tool call returns an auth/consent
error: standalone → tell the user to complete the prompt and retry;
ship-invoked → board-unavailable error (autonomous runs cannot complete
OAuth; the environment must be authenticated ahead of time).

## Auth check

There is no separate auth probe; the first tool call doubles as the check
(see OAuth note above).

## Fetch ticket

Call `mcp__plugin_qa_atlassian__getJiraIssue` with:

```json
{ "issueIdOrKey": "<id>" }
```

The result includes summary, description, status, labels, and comments. A
tool error (not found, no access) → report the error message verbatim and
fail fast.

## Post comment

Call `mcp__plugin_qa_atlassian__addCommentToJiraIssue` with:

```json
{ "issueIdOrKey": "<id>", "commentBody": "<comment markdown>" }
```

A tool error → the skill's verdict-preservation rule applies (retry once,
then save the comment to the artifacts dir and set `commentPosted: false`).

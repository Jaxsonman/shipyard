---
description: Start the Shipyard dashboard — a local web UI for pipeline tickets across linked projects
---

Start the Shipyard dashboard server and give the user the URL.

1. Run in the background: `node ${CLAUDE_PLUGIN_ROOT}/server/server.js --open`
2. The server prints `Shipyard dashboard: http://127.0.0.1:<port>` on stdout when ready, and opens the user's browser (`--open`).
3. Report the URL to the user. If the server exits non-zero, show its stderr verbatim — common causes: Node < 18, all ports 7433–7453 busy.
4. Do not keep polling it; it runs until the user stops it.

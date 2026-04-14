## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.
## 2024-05-18 - Local Dev Server CORS and CSWSH Bypass
**Vulnerability:** The local development Express server and WebSocket endpoints bound to local addresses (`127.0.0.1`) were vulnerable to Cross-Site WebSocket Hijacking (CSWSH) and Cross-Site Request Forgery (CSRF). Unauthorized origins (e.g., malicious scripts running on a web page visited by the developer) could connect and interact with the endpoints.
**Learning:** Local dev servers are NOT secure simply by being bound to `localhost` or `127.0.0.1`. The browser can still make cross-origin requests to local endpoints unless strictly prevented by CORS policies on HTTP endpoints and `verifyClient` origin checks on WebSockets.
**Prevention:** Implement strict explicit origin matching in `cors` middleware, forcefully returning HTTP 403 on invalid origins via fallback middleware. Use `verifyClient` within `WebSocketServer` configurations to validate the connecting `origin` against the identical strict whitelist.

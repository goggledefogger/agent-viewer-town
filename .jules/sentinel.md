## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.

## 2026-02-14 - Missing Origin Validation on Local Server
**Vulnerability:** The local development server bound to `127.0.0.1` lacked strict CORS and WebSocket origin verification.
**Learning:** Local servers are implicitly vulnerable to Cross-Site Request Forgery (CSRF) and Cross-Site WebSocket Hijacking (CSWSH). A malicious public website can use a victim's browser to send requests to `localhost` or open WebSockets to intercept data if explicit checks aren't enforced.
**Prevention:** Always implement robust CORS middleware with explicit fallback logic for 403 blocks and use `verifyClient` to check origins on `ws` WebSocketServers to restrict access solely to allowed local domains (`localhost`, `127.0.0.1`, `[::1]`).

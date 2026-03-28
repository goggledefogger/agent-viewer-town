## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.

## 2026-03-27 - Local Development Server Open to Cross-Origin Attacks
**Vulnerability:** The local server lacked `cors` middleware for HTTP API endpoints and `verifyClient` origin validation for WebSockets, allowing Cross-Site Request Forgery (CSRF) and Cross-Site WebSocket Hijacking (CSWSH) from malicious browser origins.
**Learning:** Local development servers, even when bound safely to `127.0.0.1`, remain vulnerable to attacks from the browser context if strict cross-origin policies are not enforced.
**Prevention:** Always implement strict CORS policies restricting access to expected local frontend origins (`http://localhost:*`, `http://127.0.0.1:*`) and validate the `Origin` header in WebSocket servers using `verifyClient`.

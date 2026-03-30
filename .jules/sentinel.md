## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.

## 2025-02-28 - Missing CORS and WebSocket Origin Validation
**Vulnerability:** The server (`packages/server`) lacks `cors` middleware for its HTTP endpoints and `verifyClient` origin validation for its `WebSocketServer`, making it vulnerable to Cross-Site Request Forgery (CSRF) and Cross-Site WebSocket Hijacking (CSWSH).
**Learning:** Local development servers, even when bound safely to `127.0.0.1`, remain vulnerable to attacks from the browser context (such as CSWSH) if strict cross-origin policies are not enforced.
**Prevention:** Always implement `cors` middleware for HTTP servers and `verifyClient` for WebSocket servers to restrict allowed origins (e.g., to `localhost` and `127.0.0.1`) when exposing sensitive local services.

## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.
## 2024-06-25 - Prevent Cross-Site WebSocket Hijacking (CSWSH) and CSRF
**Vulnerability:** The Express server and WebSocket Server lacked strict origin validation, making them vulnerable to CSRF and CSWSH from arbitrary browser contexts (e.g. maliciious domains making requests to localhost:3001).
**Learning:** Local development servers, even when bound safely to `127.0.0.1`, remain vulnerable to attacks from the browser context if strict cross-origin policies are not enforced.
**Prevention:** Implement CORS middleware for REST endpoints and a `verifyClient` callback for WebSockets to explicitly validate the `Origin` header against an allowed local origin pattern.

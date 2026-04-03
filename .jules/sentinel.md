## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.
## 2025-04-03 - [Cross-Site WebSocket Hijacking & CSRF in Local Dev Server]
**Vulnerability:** The local development server bound to `127.0.0.1:3001` had no origin validation on its API endpoints or WebSocket server. This allowed any malicious website visited by the user to connect to the local WebSocket (CSWSH) and send requests to local API endpoints (CSRF).
**Learning:** Local development servers, even when bound safely to `127.0.0.1`, remain vulnerable to attacks from the browser context (such as Cross-Site WebSocket Hijacking) if strict cross-origin policies (CORS middleware and `verifyClient` Origin validation) are not enforced.
**Prevention:** Always implement explicit CORS middleware for API endpoints and `verifyClient` for WebSocket servers to reject unexpected origins, ensuring only expected local clients (e.g., `http://localhost:5173`) can interact with the server.

## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.
## 2024-04-12 - Missing CORS and CSWSH Protection
**Vulnerability:** The local development server binds to 127.0.0.1 but lacked both CORS middleware and `verifyClient` Origin validation for its WebSocket endpoint, leaving it vulnerable to Cross-Site WebSocket Hijacking (CSWSH) and Cross-Site Request Forgery (CSRF).
**Learning:** Local development servers, even when bound safely to `127.0.0.1`, remain vulnerable to attacks from the browser context if strict cross-origin policies are not enforced.
**Prevention:** Always implement explicit CORS fallback middleware and `verifyClient` logic (using safe defaults like `['localhost', '127.0.0.1', '[::1]']`) for WebSocket implementations to restrict unauthorized browser connections.

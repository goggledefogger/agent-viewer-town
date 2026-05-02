## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.
## 2026-05-02 - Missing CORS Policy and CSWSH Protection
**Vulnerability:** Lack of origin validation allowed any website to make requests to the local server and initiate WebSocket connections (Cross-Site WebSocket Hijacking).
**Learning:** Even local development servers bound to 127.0.0.1 are vulnerable to cross-origin attacks from the browser. Using the `cors` package alone is sometimes insufficient if it doesn't explicitly reject unauthorized origins with a 403 status for all request types.
**Prevention:** Implement strict CORS policies and WebSocket `verifyClient` origin validation. Always block the 'null' origin and only allow trusted development origins.

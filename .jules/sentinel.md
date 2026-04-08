## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.

## 2026-04-08 - Missing CORS and CSWSH Protection
**Vulnerability:** The server lacked Cross-Origin Resource Sharing (CORS) configuration for API endpoints and `verifyClient` validation for its WebSocket server, exposing it to cross-origin attacks like CSRF and Cross-Site WebSocket Hijacking (CSWSH) from malicious websites.
**Learning:** Local development servers, even when bound securely to `127.0.0.1`, remain vulnerable to attacks originating from a user's browser context unless strict origin validation policies are explicitly implemented.
**Prevention:** Always implement origin validation via CORS middleware for REST APIs and `verifyClient` for WebSocket connections, strictly allowing only trusted local origins (e.g., `localhost` and `127.0.0.1`) for local tooling servers.

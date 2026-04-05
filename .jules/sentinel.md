## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.
## 2023-10-27 - Missing Cross-Origin Policies on Local Development Servers
**Vulnerability:** Local development server running on `127.0.0.1` was vulnerable to Cross-Site WebSocket Hijacking (CSWSH) and Cross-Site Request Forgery (CSRF).
**Learning:** Localbound servers are still reachable from the user's browser context. Without strict `Origin` header validation on both WebSocket connections and HTTP endpoints, malicious websites can blindly send requests or establish WebSocket connections to the local server, potentially compromising the local machine or reading sensitive session data.
**Prevention:** Always enforce strict `Origin` validation using CORS middleware for HTTP endpoints and `verifyClient` for WebSocket servers, restricting access only to trusted local origins (e.g., `http://localhost:3000`).

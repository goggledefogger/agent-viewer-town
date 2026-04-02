## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.
## 2024-04-01 - Missing Strict Origin Validation on Local Server
**Vulnerability:** The local development server (`packages/server`) was vulnerable to Cross-Site Request Forgery (CSRF) and Cross-Site WebSocket Hijacking (CSWSH).
**Learning:** Local development servers, even when bound safely to `127.0.0.1`, remain vulnerable to attacks from the browser context if strict cross-origin policies are not enforced. Without Origin validation, malicious scripts on arbitrary websites can connect to the local server via WebSockets or make cross-origin POST requests if CORS is not configured strictly.
**Prevention:** Always enforce strict CORS rules and `verifyClient` Origin validation for WebSockets to restrict access strictly to trusted local origins (e.g. `http://localhost:5173` and `http://127.0.0.1:5173`). Include a CSP in the client to provide defense-in-depth against unauthorized connections.

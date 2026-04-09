## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.

## 2024-04-09 - Cross-Site Request Forgery & Cross-Site WebSocket Hijacking
**Vulnerability:** Local development servers, even when bound to 127.0.0.1, remain vulnerable to CSWSH and CSRF from malicious scripts running in the user's browser via different origins.
**Learning:** Browsers implicitly send credentials/requests to localhost if origin checks are not explicitly enforced, enabling attackers to hijack WebSockets and make unauthorized API calls.
**Prevention:** Always implement strict CORS policies returning 403 for unknown origins on HTTP endpoints and enforce `verifyClient` origin checks for WebSocket connections to reject untrusted connections.

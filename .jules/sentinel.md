## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.

## 2026-04-24 - Cross-Site WebSocket Hijacking Risk on Local Server
**Vulnerability:** The local express server lacked strict CORS configuration and WebSocket origin validation.
**Learning:** Local development servers, even when bound safely to `127.0.0.1`, remain vulnerable to attacks from the browser context (such as Cross-Site WebSocket Hijacking) if strict cross-origin policies (CORS middleware and `verifyClient` Origin validation) are not enforced. Also, the string "null" from iframes must be explicitly checked and rejected to avoid bypasses.
**Prevention:** Always enable `cors` middleware with an allowlist, provide a fallback 403 middleware to enforce it, and implement `verifyClient` checking origins on WebSocketServers. Ensure `null` origins are explicitly rejected.

## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.

## 2026-02-14 - Express WebSockets and CSWSH
**Vulnerability:** Local servers can be vulnerable to Cross-Site WebSocket Hijacking (CSWSH) and unauthorized API calls if strict origin checks aren't performed.
**Learning:** Returning `callback(null, false)` with the `cors` package does not reject requests, it only omits headers. To properly restrict access, explicit `verifyClient` must be used for WebSockets, and fallback middleware checking `req.headers.origin` must be used for Express APIs. Setting `'null'` origin must also be explicitly blocked to prevent iframe sandbox bypasses.
**Prevention:** Implement `verifyClient` to check WebSocket connections. Combine the `cors` middleware with custom explicit blocking logic checking `req.headers.origin` for APIs. Always check for strings like `'null'`.

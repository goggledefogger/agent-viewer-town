## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.

## 2026-02-15 - Local Server Origin Vulnerabilities
**Vulnerability:** Local development servers binding safely to `127.0.0.1` are vulnerable to browser context attacks (e.g., Cross-Site WebSocket Hijacking and CSRF).
**Learning:** Browsers do not automatically protect local servers from cross-origin requests. Explicit CORS middleware and `verifyClient` origin validation on WebSocket connections are required. Furthermore, when blocking sandboxed iframes, explicitly rejecting the string `'null'` is necessary.
**Prevention:** Implement rigorous origin validation checks restricting origins to known safe localhost variants (`localhost`, `127.0.0.1`, `[::1]`) while specifically filtering out `'null'` origins.

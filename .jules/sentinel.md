## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.
## 2025-05-18 - Prevent CSRF and Cross-Site WebSocket Hijacking (CSWSH)
**Vulnerability:** Local development server lacked CORS restrictions and WebSocket connection origin validation, allowing potential cross-origin attacks from malicious sites loaded in the user's browser.
**Learning:** Local dev servers bound to 127.0.0.1 remain vulnerable to browser-context attacks (like CSRF and CSWSH) if strict same-origin policies aren't explicitly enforced. The `ws` library does not validate origins by default.
**Prevention:** Implement `verifyClient` for `ws` to explicitly check the `Origin` header against an allowlist (e.g., `localhost`/`127.0.0.1`), and use standard CORS middleware for Express endpoints.

## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.

## 2026-02-14 - Missing CORS and WebSocket Origin Validation
**Vulnerability:** Local development servers, even when bound safely to `127.0.0.1`, remain vulnerable to attacks from the browser context (such as Cross-Site WebSocket Hijacking and cross-origin fetch requests) if strict cross-origin policies (CORS middleware and `verifyClient` Origin validation) are not enforced.
**Learning:** Localhost does not inherently protect against cross-origin browser attacks. A malicious website could trigger actions on the local server if the browser's default behavior is not explicitly restricted by the server logic. The bun runtime specifically has an issue when rejecting a connection via `callback(false, 403)`, so graceful rejection `callback(null, false)` is used for `cors`.
**Prevention:** Always implement CORS middleware for HTTP endpoints and `verifyClient` origin checks for WebSocket servers, explicitly validating the hostnames (e.g., `localhost`, `127.0.0.1`) rather than relying on implicitly trusted environments.

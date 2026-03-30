## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.

## 2026-02-14 - CSWSH Protection on Local Development Servers
**Vulnerability:** Cross-Site WebSocket Hijacking (CSWSH) and unauthorized cross-origin access on local servers.
**Learning:** Local development servers, even when bound safely to `127.0.0.1`, remain vulnerable to attacks from the browser context (such as CSWSH) if strict cross-origin policies (CORS middleware and `verifyClient` Origin validation) are not enforced.
**Prevention:** Always implement explicit CORS configuration to reject unexpected Origin headers for HTTP requests and validate the Origin using `verifyClient` for WebSocket servers to prevent CSWSH attacks. When validating the Origin, return `callback(false, 403, 'Forbidden')` rather than an Error object to avoid crashing the server.

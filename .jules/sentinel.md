## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.

## 2026-02-14 - Localhost is not an Island (CSWSH and CORS Bypass)
**Vulnerability:** A local development server bound to `127.0.0.1` can still be targeted by external attackers via Cross-Site WebSocket Hijacking (CSWSH) and unauthorized API requests if a victim visits a malicious site while the server is running.
**Learning:** Browsers implicitly allow cross-origin requests (including WebSockets) to localhost unless strictly blocked. Furthermore, relying solely on Express `cors` middleware for API endpoints is insufficient if it only omits CORS headers (returning 200/204) rather than firmly rejecting the request with a 403. Finally, malicious iframes can send a `null` origin, which bypasses naive hostname checks.
**Prevention:** Implement strict origin validation using a dedicated allowlist for both HTTP APIs (using `cors` *plus* a fallback 403 middleware) and WebSockets (via `verifyClient`). Always explicitly block `null` origins.

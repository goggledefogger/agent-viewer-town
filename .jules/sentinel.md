## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.

## 2024-05-24 - Cross-Site WebSocket Hijacking and CORS Bypass Protection
**Vulnerability:** The local development server was vulnerable to Cross-Site WebSocket Hijacking (CSWSH) and potentially CSRF because it lacked origin validation for WebSocket connections and API endpoints. Additionally, relying solely on `cors` package with `callback(null, false)` is insufficient to block simple unauthorized requests.
**Learning:** Local servers, even when bound safely to `127.0.0.1`, remain vulnerable to attacks from arbitrary websites running in the user's browser. The `cors` package in Express simply omits CORS headers when a request is rejected by the origin function; it does not block the request. To forcefully block unauthorized origins, explicit middleware returning a 403 status is required. WebSockets require `verifyClient` to perform the same origin validation.
**Prevention:** Always implement explicit 403 fallback middleware when using `cors` if the intention is to completely block unauthorized origins. Add `verifyClient` to WebSocketServer to block unauthorized browser origin connections. Ensure origin validation safely allows non-browser clients (undefined origin) and explicitly rejects the "null" origin.

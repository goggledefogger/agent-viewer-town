## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.

## 2026-03-10 - Adding CORS and CSWSH protection
**Vulnerability:** Lack of origin validation for cross-origin requests and WebSockets allowed any website to interact with local endpoints, leading to potential Cross-Site WebSocket Hijacking (CSWSH) and CSRF attacks.
**Learning:** The Express application and `ws` WebSocketServer were serving HTTP and WS endpoints without restricting origins. Browsers enforce Same-Origin Policy for HTTP by default but allow cross-origin WebSocket connections unless explicitly verified by the server.
**Prevention:** Implemented explicit CORS middleware for HTTP endpoints and `verifyClient` for `WebSocketServer` to validate the `Origin` header against an allowed list, falling back to localhost by default.

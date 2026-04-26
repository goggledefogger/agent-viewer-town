## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.

## 2024-05-24 - Add Origin Validation and CORS Configuration
**Vulnerability:** Missing Origin Validation allowing for Cross-Site Request Forgery (CSRF) and Cross-Site WebSocket Hijacking (CSWSH) across API endpoints and WebSockets in `packages/server/src/index.ts`.
**Learning:** The Express backend and WebSocket server lacked CORS restrictions and origin verification, making them accessible to any domain.
**Prevention:** Implement an allowlist of origins and validate requests via `cors` middleware for Express and `verifyClient` for WebSocketServer using a shared array of permitted origins. Always validate the origin for web endpoints intended for specific clients.

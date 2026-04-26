## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.

## 2026-03-11 - Cross-Site WebSocket Hijacking (CSWSH) Architecture Gap
**Vulnerability:** The server lacked authentication and origin validation for WebSocket and REST endpoints, exposing it to Cross-Site WebSocket Hijacking (CSWSH) and unauthorized cross-origin access.
**Learning:** In local development servers that rely heavily on WebSockets for critical application state or integration (like Claude Code visualizers), ignoring WebSocket origin validation leaves local endpoints highly vulnerable to cross-site attacks from arbitrary internet origins.
**Prevention:** Always implement centralized origin validation for both HTTP REST interfaces and WebSocket connections (using `ws`'s `verifyClient`) right from the start, configured via an allowlist like `ALLOWED_ORIGINS`.

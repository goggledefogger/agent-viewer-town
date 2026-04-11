## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.

## 2024-05-24 - Cross-Site WebSocket Hijacking (CSWSH) and CSRF in Local Server
**Vulnerability:** The Agent Viewer local server (`packages/server/src/index.ts`) accepted connections from any origin. This meant malicious websites visited by the developer could connect to the local WebSocket server (CSWSH) or make POST requests to `/api/hook` (CSRF), potentially reading state or injecting false hook data.
**Learning:** Local development servers, even when bound safely to `127.0.0.1`, remain vulnerable to attacks from the browser context if strict cross-origin policies are not enforced.
**Prevention:** Always implement `cors` middleware with strict origin checks for HTTP endpoints and validate the `origin` header via `verifyClient` in `ws` WebSocketServer configurations to restrict connections to trusted origins (e.g., `localhost`, `127.0.0.1`, `[::1]`).

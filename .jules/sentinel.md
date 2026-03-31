## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.
## 2025-02-28 - Missing WebSocket Origin and REST CORS Protections
**Vulnerability:** The local development server (`packages/server`) did not enforce strict cross-origin checks (`verifyClient` Origin validation for WebSockets and custom `corsMiddleware` for REST endpoints), leaving the server vulnerable to Cross-Site WebSocket Hijacking (CSWSH) and general CSRF attacks from a browser context.
**Learning:** Even though local development servers bind to localhost or 127.0.0.1, they can still be exploited by malicious sites running in the browser if explicit Origins are not enforced via the `verifyClient` WebSocket property or `cors` implementations.
**Prevention:** Always implement explicit Origin validation to restrict access on local development services, ensuring they only process requests and connections originating from trusted development URIs (e.g. localhost, 127.0.0.1).

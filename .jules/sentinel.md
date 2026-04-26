## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.
## $(date +%Y-%m-%d) - [CSWSH and CORS protection]
**Vulnerability:** The server didn't enforce CORS for API endpoints or perform origin checks for WebSocket connections.
**Learning:** For a local development app communicating via WS and HTTP, omitting explicit allowed origin bounds opens it to Cross-Site WebSocket Hijacking and malicious Cross-Origin Resource Sharing attacks from malicious sites run in the same browser.
**Prevention:** Implement origin allow-listing (e.g. env var `ALLOWED_ORIGINS` defaulting to localhost:5173), verify the origin within `corsMiddleware` for HTTP APIs and `verifyClient` in `ws` for WebSockets.

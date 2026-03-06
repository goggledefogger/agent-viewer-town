## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.
## 2025-02-14 - CORS Protection Added
**Vulnerability:** Missing Cross-Origin Resource Sharing (CORS) limits.
**Learning:** Because standard WebSockets don't follow the Same-Origin Policy the same way fetch does, missing a verifyClient lets malicious sites hijack local state.
**Prevention:** Always specify allowed origins using CORS for APIs and 'verifyClient' for web sockets.

## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.

## 2026-02-14 - Missing Origin Validation for Local WebSocket Server (CSWSH)
**Vulnerability:** The local WebSocket server (`ws://127.0.0.1:3001/ws`) and Express HTTP endpoints lacked origin validation.
**Learning:** Any malicious public website visited by the developer could connect to the local Agent Viewer server via WebSockets or make Cross-Site Request Forgery (CSRF) API calls, allowing attackers to read or manipulate local agent sessions. Local developer tools binding to loopback interfaces are inherently vulnerable to these attacks if `Origin` headers are not strictly checked.
**Prevention:** Always implement origin validation on local web and WebSocket servers. Use the `cors` package for Express and the `verifyClient` callback in `ws` to ensure the `Origin` header matches `localhost` or `127.0.0.1` (or is absent for non-browser clients). Additionally, enforce a strict Content Security Policy (CSP) in the frontend application.

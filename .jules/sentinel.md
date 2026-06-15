## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.


## 2026-02-14 - Child Process Command Injection Risk
**Vulnerability:** Use of `child_process.exec` allowing for potential shell command injection if arguments become dynamic, and vulnerability to executable hijacking via the current directory on Windows systems.
**Learning:** `packages/server/src/touchbar.ts` used `exec` for external commands like `pgrep` and `open`.
**Prevention:** Replace `child_process.exec` with `child_process.execFile` utilizing an array of arguments, and include `{ env: { ...process.env, NoDefaultCurrentDirectoryInExePath: '1' } }` in the options to mitigate current-directory executable hijacking.

## 2024-05-01 - Insufficient File System Path Validation in Hook Payloads
**Vulnerability:** The `/api/hook` endpoint accepted `cwd` parameters validated only by `path.isAbsolute(event.cwd)`, making it susceptible to path traversal via `..`, dangerous shell characters, and null bytes injection, allowing potential escape or shell injection upon execution.
**Learning:** `path.isAbsolute` solely verifies if a path represents an absolute origin in Node.js context, but does not sanitize or prohibit relative segments or hazardous shell characters when the path is fed to command processes like `execFile` or `spawn`.
**Prevention:** Implement comprehensive path validation via `isSafePath` that blocks traversal patterns (`..`), null bytes (`\0`), typical shell metacharacters (`[;&|$><*?!\n\r]`), and explicitly enforces absolute format utilizing platform-specific checks.

## 2025-03-01 - Missing CORS and WebSocket Origin Validation on Local Server
**Vulnerability:** The local development server (`packages/server`) bound to `127.0.0.1` lacked CORS middleware for HTTP endpoints and `Origin` header validation for WebSocket handshakes (`/ws`). This allowed malicious websites visited by the developer to potentially perform Cross-Site WebSocket Hijacking (CSWSH) and unauthorized cross-origin HTTP requests against the local server.
**Learning:** Local servers, even when bound safely to loopback (`127.0.0.1`), are still vulnerable to attacks from the browser context if cross-origin policies are not enforced. Attackers can pivot through the developer's browser to send payloads or exfiltrate state.
**Prevention:** Always implement `cors` middleware configured with a strict allowlist (e.g., `localhost` and `127.0.0.1`) and enforce identical validation in WebSocket server configurations via `verifyClient`. Return `false` in CORS origin callbacks rather than throwing an Error to handle unauthorized requests gracefully.
## 2024-06-15 - [CORS 403 Fallback and 'null' Origin Blocking]
**Vulnerability:** The `cors` middleware was configured to return `callback(null, false)` for unauthorized origins. This strips CORS headers but does NOT prevent the request from executing, leaving API endpoints vulnerable to direct requests from unauthorized clients (e.g. server-to-server or scripts ignoring CORS). Additionally, the `isAllowedOrigin` function did not explicitly block the `'null'` string, which could be exploited via sandboxed iframes.
**Learning:** Returning `false` in a `cors` origin callback is insufficient for actual security enforcement; it only controls browser-side response reading. Explicit fallback middleware is required to actively reject (e.g., return 403) unauthorized requests based on the `Origin` header. Furthermore, `new URL('null')` bypasses standard checks as it is an invalid URL that throws an exception, and if not handled correctly, can bypass logic.
**Prevention:** Always implement an explicit 403 Forbidden middleware to check `req.headers.origin` against the allowed origins *after* standard CORS middleware if you want to actively block requests. Explicitly check for and block the literal string `'null'` in origin validation logic.

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

## 2026-05-14 - Express CORS Middleware Bypass
**Vulnerability:** The `cors` package configured in Express only omits CORS headers for disallowed origins, but does not block the request from executing if it is a simple request (like GET or POST with JSON/form data).
**Learning:** Returning `false` in the CORS origin callback handles preflight requests correctly by preventing the browser from continuing, but simple requests from malicious origins still reach the endpoint, allowing CSWSH or state mutations. Additionally, the string `'null'` origin needs to be explicitly blocked as it can bypass hostname matching while remaining valid for sandboxed iframes.
**Prevention:** Always include a custom fallback middleware after `app.use(cors())` that explicitly checks `req.headers.origin` and returns `res.status(403)` if it is disallowed. Explicitly block `'null'` in custom origin validation logic.

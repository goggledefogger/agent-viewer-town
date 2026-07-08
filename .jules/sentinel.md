## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools. Enforce absolute path format and restrict session_id length.

## 2026-02-14 - Child Process Command Injection Risk
**Vulnerability:** Use of dynamic shell-spawning APIs allowing for potential shell command injection if arguments become dynamic, and vulnerability to executable hijacking via the current directory on Windows systems.
**Learning:** `packages/server/src/touchbar.ts` previously invoked external commands like `pgrep` and `open` via a shell-based API.
**Prevention:** Use `child_process.execFile` with an array of arguments, and include `{ env: { ...process.env, NoDefaultCurrentDirectoryInExePath: '1' } }` in the options to mitigate current-directory executable hijacking.

## 2024-05-01 - Insufficient File System Path Validation in Hook Payloads
**Vulnerability:** The `/api/hook` endpoint accepted `cwd` parameters validated only by `path.isAbsolute(event.cwd)`, making it susceptible to path traversal via `..`, dangerous shell characters, and null bytes injection, allowing potential escape or shell injection upon execution.
**Learning:** `path.isAbsolute` solely verifies if a path represents an absolute origin in Node.js context, but does not sanitize or prohibit relative segments or hazardous shell characters when the path is fed to command processes like `execFile` or `spawn`.
**Prevention:** Implement comprehensive path validation via `isSafePath` that blocks traversal patterns (`..`), null bytes (`\0`), typical shell metacharacters (`[;&|$><*?!\n\r]`), and explicitly enforces absolute format utilizing platform-specific checks. Additionally, enforce absolute paths for `cwd` using `path.isAbsolute()` and sanitize/limit identifier strings to prevent memory exhaustion.

## 2025-03-01 - Missing CORS and WebSocket Origin Validation on Local Server
**Vulnerability:** The local development server (`packages/server`) bound to `127.0.0.1` lacked CORS middleware for HTTP endpoints and `Origin` header validation for WebSocket handshakes (`/ws`). This allowed malicious websites visited by the developer to potentially perform Cross-Site WebSocket Hijacking (CSWSH) and unauthorized cross-origin HTTP requests against the local server.
**Learning:** Local servers, even when bound safely to loopback (`127.0.0.1`), are still vulnerable to attacks from the browser context if cross-origin policies are not enforced. Attackers can pivot through the developer's browser to send payloads or exfiltrate state.
**Prevention:** Implement strict CORS policies and WebSocket `verifyClient` origin validation. Always block the 'null' origin and only allow trusted development origins. Return `false` in CORS origin callbacks rather than throwing an Error to handle unauthorized requests gracefully.

## 2026-02-14 - Integration Tests vs Unit Tests in Restricted Env
**Vulnerability:** Process vulnerability. Integration tests spawning server processes failed due to `ERR_MODULE_NOT_FOUND` in restricted environment.
**Learning:** `spawn`ing `tsx` requires full `node_modules` resolution which can be flaky in restricted envs.
**Prevention:** Prefer unit tests that mock Express/HTTP objects over integration tests that spawn processes, especially for logic like middleware.

## 2026-05-06 - Preventing Git Executable Hijacking on Windows
**Vulnerability:** Invoking commands like `git` via `execFile` can be susceptible to hijacking on Windows if a malicious `git.exe` is placed in the project directory, as Windows resolves executables in the current directory before checking the system path.
**Learning:** Utilities invoking git operations via wrappers like `execFileAsync` in `packages/server/src/parsers/gitUtils.ts` must propagate appropriate environment guards. Simply passing `cwd` without configuring the execution environment ignores the path resolution mechanics on Windows.
**Prevention:** When executing git operations via `execFileAsync` wrappers, always merge `process.env` and include `NoDefaultCurrentDirectoryInExePath: '1'` in the environment options to prevent Windows executable hijacking. This also necessitates updating wrapper signatures to accept an `env?: any` option.

## 2026-07-02 - Predictable /tmp/ File Creation and Symlink Attack Vulnerability
**Vulnerability:** Use of predictable temporary files in world-writable directories (e.g., `/tmp/`) allows malicious local users to conduct symlink attacks, potentially overwriting arbitrary files owned by the executing user.
**Learning:** Scripts and application logic like the Touch Bar integration and shell templates previously wrote files (e.g. `/tmp/agent-viewer-touchbar.json`, `/tmp/MTMR.dmg`) with predictable names. On multi-user systems, attackers can pre-create symlinks at these paths to corrupt or overwrite sensitive files with elevated privileges when the app writes to them.
**Prevention:** Avoid writing to `/tmp/` with hardcoded names. Use user-owned home directory paths (e.g. `$HOME` or `~/`) for predictable application state, or use dynamically generated temp files via `mktemp` or `mkdtemp`.
## 2025-02-28 - Prevent Timing Attacks in Token Validation
**Vulnerability:** Strict equality (`===`) comparison in authentication token validation allowed timing attacks, potentially leaking token length and contents.
**Learning:** `crypto.timingSafeEqual` prevents timing attacks, but strictly requires matching length buffers. A robust pattern to ensure lengths always match—without throwing errors that leak information—is to first hash both the provided and expected strings using SHA-256 before the constant-time comparison.
**Prevention:** Avoid strict string equality (`===`) when verifying security tokens, secrets, or passwords. Always use hashing followed by constant-time string comparisons.

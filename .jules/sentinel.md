## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.

## 2026-02-15 - Hook Endpoint Input Validation
**Vulnerability:** The `/api/hook` endpoint accepted relative `cwd` paths, which could lead to ambiguous or incorrect git operations, and unlimited `session_id` lengths, potentially causing memory exhaustion.
**Learning:** Even internal tools need robust input validation. Relative paths in `cwd` arguments for `execFile` or `spawn` can have unintended consequences if the server's working directory is not what the caller expects.
**Prevention:** Always enforce absolute paths for `cwd` using `path.isAbsolute()` and sanitize/limit identifier strings.

## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.
## 2025-04-26 - [Path Traversal & Command Injection in cwd]
**Vulnerability:** The `/api/hook` endpoint accepted any absolute path for the `cwd` field without checking for path traversal (`..`) or shell metacharacters (`;&|$<>` etc.). It also improperly validated cross-platform absolute paths using `path.isAbsolute()` which behaves differently depending on the OS the server is running on.
**Learning:** `path.isAbsolute()` is insufficient for security validation because cross-platform agents (e.g. Windows agents connecting to a Linux server) can send paths that bypass the check or are incorrectly interpreted. Also, relying solely on absolute path checks does not prevent path traversal if `..` segments are allowed, which could lead to command execution outside the intended workspace boundaries.
**Prevention:** Always implement a dedicated `isSafePath` utility to enforce exact absolute path structures across platforms, block null bytes, block traversal markers (`..`), and sanitize/block shell metacharacters.

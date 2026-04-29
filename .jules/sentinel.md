## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.

## 2025-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute commands. Even if `execFile` or similar mitigations are used, an unvalidated `cwd` value can lead to path traversal vulnerabilities and potentially arbitrary command execution in combination with shell metacharacters.
**Prevention:** Always use rigorous path validation functions such as `isSafePath` that enforce cross-platform absolute path patterns, block path traversal (`..`), block null bytes, and block dangerous shell metacharacters before passing paths to operating system-level APIs.

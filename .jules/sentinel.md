## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.

## 2026-03-26 - Trusting External Inputs in Path Operations
**Vulnerability:** Path traversal vulnerability due to insufficient validation of the `cwd` field in hook inputs.
**Learning:** `path.isAbsolute()` is insufficient to prevent traversal. An absolute path string like `/app/project/../../etc/passwd` evaluates as true for `isAbsolute()`, enabling Directory Traversal when later used directly in shell commands or file operations without proper resolution.
**Prevention:** Always validate path inputs using both absolute checks and explicit inspection for path traversal segments (e.g. `path.split(/[/\\]/).includes('..')`), especially when paths traverse OS boundaries (handling Windows format correctly on POSIX nodes).

## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.

## 2025-02-14 - Path Traversal Vulnerability in cwd Hook Input
**Vulnerability:** The `cwd` input in the server's webhook validation lacked a check for path traversal segments (e.g. `..`), meaning an attacker could craft an absolute path containing directory traversals that would bypass the `path.isAbsolute` check but resolve differently.
**Learning:** Checking `path.isAbsolute(event.cwd)` is insufficient, because an absolute path can still be exploited via traversal sequences when passed to subsequent code handling files/commands. And `path.normalize` can convert valid Unix paths to Windows paths, rejecting them incorrectly.
**Prevention:** Use a specific regular expression or `.split(/[/\\]/).includes('..')` on file paths provided by users/hooks before trusting them to prevent path traversal issues.

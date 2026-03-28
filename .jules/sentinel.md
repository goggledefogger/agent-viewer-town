## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.
## 2024-10-27 - Path Traversal Prevention in Cross-Platform Environments
**Vulnerability:** Path traversal (CWE-22) in user-provided directory paths (`cwd`).
**Learning:** Using `path.isAbsolute` in Node.js is insufficient for validating cross-platform paths because its behavior depends on the host OS. A Windows path like `C:\path` might be treated as relative on a Linux server, and a simple string includes check for `..` might catch valid directories named `a..b`.
**Prevention:** Always validate both Windows (`/^[a-zA-Z]:[\\/]/`) and POSIX (`startsWith('/')`) absolute paths explicitly. Prevent path traversal by splitting the path string by cross-platform separators (`/[/\\]/`) and checking for exact `..` segments, rather than using string matching or `path.normalize`.

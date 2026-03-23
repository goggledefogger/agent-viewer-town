## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.
## 2024-05-24 - Cross-Platform Path Traversal Validation
**Vulnerability:** The `/api/hook` endpoint accepted an absolute `cwd` path but failed to explicitly check for and reject path traversal sequences (`..`). Since `cwd` is used for Git command execution, this allowed potential command injection via path traversal across directories.
**Learning:** Checking `path.isAbsolute()` is insufficient for security validation of arbitrary paths on node, and Windows drive roots (`C:\`) and directory separators (`\`) require explicit cross-platform handling when run on Unix-based servers.
**Prevention:** Always parse or split user-provided file paths across both separator types (`/[/\\]/`) and explicitly scan for `..` segments, even if the path technically evaluates as absolute.

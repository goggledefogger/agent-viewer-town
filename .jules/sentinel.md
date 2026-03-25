## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.

## 2026-03-01 - Cross-Platform Path Traversal Validation in Node.js
**Vulnerability:** Path traversal attacks (`..`) could bypass directory containment checks when resolving `cwd` parameters.
**Learning:** `path.isAbsolute()` in Node.js on non-Windows environments evaluates to `false` for valid Windows absolute paths (e.g., `C:\Windows`), and checking `path.normalize(p) === p` can falsely reject valid paths due to separator conversion (e.g., `/` to `\`).
**Prevention:** Always validate path traversals by safely splitting the path string (`p.split(/[/\\]/)`) and explicitly checking for `..` segments to ensure cross-platform safety.

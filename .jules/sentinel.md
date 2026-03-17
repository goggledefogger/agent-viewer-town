## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.

## 2025-02-23 - Cross-Platform Path Traversal Detection
**Vulnerability:** Path traversal detection failing on Windows when only checking for `/..`.
**Learning:** Path validation in Node.js must account for cross-platform separators. Using `path.normalize(p) === p` can falsely reject valid paths on OSs like Windows due to separator conversion (e.g., `/` to `\`).
**Prevention:** Detect path traversal safely by splitting the path string (`p.split(/[/\\]/)`) and checking for `..` segments.

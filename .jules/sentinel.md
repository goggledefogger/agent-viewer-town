## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.
## 2025-03-21 - Fix path traversal in hook cwd validation
**Vulnerability:** Path traversal vulnerability in `/api/hook` payload validation where the `cwd` parameter was checked to be absolute and not contain null bytes but it allowed `..` path segments, enabling potential arbitrary directory access when used by execution methods (like `execFile`).
**Learning:** `path.isAbsolute` does not inherently protect against path traversal segments within an absolute path.
**Prevention:** Always validate against path traversal explicitly by looking for `..` segments using cross-platform separator parsing.

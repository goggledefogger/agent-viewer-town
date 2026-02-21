## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.

## 2025-05-23 - Hook Endpoint Input Validation
**Vulnerability:** The `/api/hook` endpoint accepted arbitrary strings for `session_id` and `cwd` without strict validation. This could potentially allow for path traversal or injection attacks if downstream components (like git execution) relied on sanitized input, or DoS via massive payloads.
**Learning:** Even internal endpoints (localhost) should validate input strictly. Relying on "it's just a local tool" is insufficient defense-in-depth. Extracting validation logic to a pure function makes it testable even when the server environment is complex or broken.
**Prevention:** Implement strict schema validation for all API inputs. Use regex whitelists for identifiers and `path.isAbsolute` for file paths.

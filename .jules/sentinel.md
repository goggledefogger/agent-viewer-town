## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.

## 2026-02-14 - Unvalidated Hook Payload Structure
**Vulnerability:** The `/api/hook` endpoint accepted any JSON payload and attempted to process it, leading to potential type errors or unexpected behavior in the `hookHandler`.
**Learning:** Even internal APIs bound to localhost should validate input structure to prevent crashes or logic errors from malformed data.
**Prevention:** Implemented strict schema validation for the hook payload, ensuring `hook_event_name` is valid and string fields are actually strings before processing.

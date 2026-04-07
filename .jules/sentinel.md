## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.

## 2025-04-06 - Prevent Shell Injection with execFile
**Vulnerability:** Shell injection risk from using `exec` in `packages/server/src/touchbar.ts`
**Learning:** `child_process.exec` passes commands to a shell which can lead to shell injection vulnerabilities even with static commands.
**Prevention:** Use `child_process.execFile` instead and pass arguments as an array to avoid invoking a shell.

## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.

## 2026-02-14 - Shell Injection in MTMR Process Management
**Vulnerability:** Arbitrary shell command execution via MTMR process management integration using `child_process.exec`.
**Learning:** `touchbar.ts` used `exec('pgrep -x MTMR')` and `exec('open -a MTMR')`. While there was no user input directly exposed here, the general pattern is dangerous and could be susceptible to environment manipulation or future injections. Using `exec` directly exposes the arguments to shell processing.
**Prevention:** Use `child_process.execFile` with arguments separated into an array, bypassing the shell. Additionally, include `{ env: { ...process.env, NoDefaultCurrentDirectoryInExePath: '1' } }` in the options to prevent current-directory executable hijacking on Windows.

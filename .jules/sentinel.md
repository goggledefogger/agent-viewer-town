## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.

## 2026-02-17 - Missing Expected Authentication
**Vulnerability:** The server was intended to support `AUTH_TOKEN` based authentication for API and WebSocket endpoints, but the implementation was entirely missing.
**Learning:** Assumptions about existing security features (based on documentation or memory) can lead to false confidence. Always verify the code implementation matches the security claims.
**Prevention:** Implement automated security regression tests that verify the presence and effectiveness of expected security controls (like authentication) in CI/CD.

## 2026-02-14 - Trusting Hook Inputs for Shell Execution
**Vulnerability:** Potential for arbitrary command execution context if hook inputs are compromised.
**Learning:** The server uses `cwd` provided in hook payloads to execute `git` commands via `execFile`. While `execFile` avoids shell injection, the `cwd` option controls the working directory, which could be abused if the input source wasn't trusted (Claude Code).
**Prevention:** Always validate `cwd` against an allowlist or ensure it resides within expected project paths, even for trusted internal tools.
## 2026-04-20 - Ensure WebSocket verifyClient and CORS enforce explicit Cross-Origin limits
**Vulnerability:** The local development server's WebSockets did not enforce any origin validation, making it vulnerable to Cross-Site WebSocket Hijacking (CSWSH). Additionally, standard Express endpoints did not enforce CORS origins, leaving them susceptible to Cross-Site Request Forgery (CSRF).
**Learning:** Local development servers, even when bound safely to `127.0.0.1`, remain vulnerable to attacks from the browser context if strict cross-origin policies (CORS middleware and `verifyClient` Origin validation) are not enforced.
**Prevention:** Always explicitly validate WebSockets' origins and configure CORS strictly with a 403 fallback middleware, blocking arbitrary browser origins and explicitly disallowing sandboxed iframe `null` origins.

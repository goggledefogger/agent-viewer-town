1. **Analyze Security Needs:**
   Based on the provided memory and codebase exploration, there's a missing cross-origin security layer in `packages/server/src/index.ts`. The server (`packages/server`) implements CORS protection but currently lacks `cors` setup for Express HTTP endpoints and `verifyClient` origin validation for the WebSocket connection in `packages/server/src/index.ts`. The missing piece is protecting WebSocket connections from Cross-Site WebSocket Hijacking (CSWSH) and standard endpoints from CSRF.

2. **Implement Security Enhancements in `packages/server/src/index.ts`:**
   - Import `cors` module.
   - Use `isValidOrigin` to validate HTTP CORS middleware. Fall back to 403 Forbidden manually for invalid origins.
   - Add `verifyClient` to `wss = new WebSocketServer({ server, path: '/ws', verifyClient: ... })` to validate the `origin` header for WebSockets.

3. **Verify Security Logic:**
   - Ensure the server is securely locked down to localhost, 127.0.0.1, and [::1] only.
   - Add a test or test the logic using bun tests.

4. **Complete Pre-Commit Steps:**
   - Check using `pnpm lint` and `pnpm test` equivalent, making sure testing pass.

5. **Create Sentinel Security PR:**
   - Create a Sentinel PR with "🛡️ Sentinel: [HIGH] Fix Cross-Site WebSocket Hijacking (CSWSH) Risk".

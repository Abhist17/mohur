# Anon-RPC in Mohur

- Package: `@anon-rpc/browser-harness` 0.4.0 (Ethereum Foundation). The harness reads a worker
  specifier contract on mainnet, fetches the bundle, verifies `keccak256(bytes) == workerHash()`, and runs
  it in a Web Worker inside a null-origin sandboxed iframe. It hands back one thing: an anonymised `fetch`.
- Workers (from the anon-rpc `adopters.json5`):
  - `tor-js`: `0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e`, config `{ gateways: [...] }` (demo gateway)
  - `nym`: `0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0`
  - `passthrough`: `0x4fd77be300f31c5fe6ab266d35d27750a3478d27` (reference, does not anonymise)
- Transport: `web/src/lib/anon.ts`. `rpc(method, params, { label, key })` is the app's only read path,
  wrapped as a viem `custom` transport per isolation scope. Every call is recorded (route, method, label,
  isolation key, latency, endpoint) for the Privacy screen.
- Isolation keys: `maker:<addr>`, `strategy:<hook>:<pair>`, `trader:<addr>`, `public`.
- Exclusions: the bootstrap specifier read (mainnet RPC, logged as "bootstrap"), and transactions
  (broadcast by the user's wallet). On the local fork, reads go to the local node directly.
- Fallbacks: non-JSON responses (e.g. Cloudflare pages to Tor exits) retry the next Base Sepolia RPC.
- Logging proxy: `proxy/server.mjs`; logs time, source IP, Tor-exit flag (from Tor's bulk exit list),
  method. `GET /log` feeds the Privacy screen.

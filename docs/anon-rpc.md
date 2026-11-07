# Anon-RPC in Tenbin

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
- Bootstrap fallbacks: the specifier read tries four mainnet RPCs in turn (publicnode, drpc, 1rpc, Tenderly; 10 s
  each). On 7 Nov one dropped connection to the first of them stopped Nym from starting and left every screen empty;
  now that read moves to the next RPC, and each attempt is logged.
- Fallbacks: non-JSON responses (e.g. Cloudflare pages to Tor exits) retry the next Base Sepolia RPC.
- Logging proxy: `proxy/server.mjs`; logs time, source IP, Tor-exit flag (from Tor's bulk exit list),
  method. `GET /log` feeds the Privacy screen.
- Tor → Nym: if Tor hasn't bootstrapped within 35 s (the EF demo Tor gateway was unreachable on 6 Nov 2026),
  the app switches to Nym, which also anonymises, and logs why. It never falls back to passthrough.
  Each request has a 25 s timeout before the next Base Sepolia RPC is tried.
- Log ranges: fill history uses 10,000-block `eth_getLogs` chunks on publicnode and drops to 200-block chunks
  automatically on RPCs that cap the range.
- Verified on the live site: `cd web && npm run e2e:testnet` opens the deployed Privacy page, starts on Tor,
  waits for the fallback, and checks that Base Sepolia (chain 84532) answered and that every chain read
  except the documented bootstrap went through Anon-RPC.
- Self-recovery: if every private route fails (a gateway blip, a slow mixnet), the app tries the network again by
  itself after 5 s, 20 s and 60 s (Nym again after a Tor fallback, not Tor), still private. Reads started meanwhile
  wait for the retry instead of failing, and every screen re-reads the moment the route is back. A route that connects
  but then times out on 3 reads in a row (seen on Nym, 7 Nov) counts as down and reconnects the same way.
- Both down: Tor gets 35 s and Nym 90 s to start. If both fail, a banner offers **Retry** or **Continue without
  privacy** (it also stays up during the automatic retries). Nothing is read until the user chooses; reads made that way go straight to a public Base Sepolia RPC and
  are logged with route `direct (not private)`, so the Privacy page's share of private reads drops honestly.
  `npm run e2e:testnet` includes a forced-outage test that blocks Tor and Nym to check exactly this.

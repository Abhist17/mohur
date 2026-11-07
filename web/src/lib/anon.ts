"use client";

import { createPublicClient, custom, type PublicClient } from "viem";
import { BOOTSTRAP_RPCS, CHAIN, DEFAULT_WORKER, NETWORK, RPC_URLS, WORKERS, type WorkerId } from "./config";

/**
 * Every chain read the app makes goes through ONE function: `rpc()` below.
 *  - base-sepolia: through the Ethereum Foundation's anon-rpc harness (Tor by default), with an isolation key
 *    per scope (maker / strategy / trader / public), so reads about different things can't be linked.
 *  - local fork: straight to the local node (no anonymity network can reach localhost) - the UI says so.
 * Each call is recorded in the read log that the Privacy screen renders.
 */

export type ReadRoute = "anon-rpc" | "local-direct" | "bootstrap" | "direct";

export type ReadLogEntry = {
  id: number;
  at: number;
  method: string;
  label: string;
  isolationKey: string;
  route: ReadRoute;
  worker?: WorkerId;
  ms: number;
  ok: boolean;
  endpoint: string;
  note?: string;
};

/** `direct`: the user chose to read without privacy because no anonymity network could start (never automatic).
 *  `retry`: which automatic retry this is (1..3) after every private route failed; absent on the first try. */
export type AnonStatus = { worker: WorkerId; state: "idle" | "booting" | "ready" | "failed"; bootMs?: number; error?: string; direct?: boolean; retry?: number; retryAt?: number };

type Listener = () => void;
const listeners = new Set<Listener>();
const log: ReadLogEntry[] = [];
let nextId = 1;
let status: AnonStatus = { worker: DEFAULT_WORKER, state: "idle" };

function emit() {
  listeners.forEach((l) => l());
}
export function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function getReadLog() {
  return log;
}
export function getAnonStatus() {
  return status;
}
function record(e: Omit<ReadLogEntry, "id" | "at">) {
  log.unshift({ ...e, id: nextId++, at: Date.now() });
  if (log.length > 500) log.length = 500;
  emit();
}

// ------------------------------------------------------------------------------------------------
// The anon-rpc worker
// ------------------------------------------------------------------------------------------------

type AnonWorker = {
  ready: Promise<void>;
  fetch: (input: string, init?: RequestInit & { anonOptions?: { isolationKey?: string } }) => Promise<Response>;
  close(): void;
};
let workerPromise: Promise<AnonWorker> | undefined;

function storedWorker(): WorkerId {
  try {
    const w = localStorage.getItem("tenbin.worker") as WorkerId | null;
    if (w && w in WORKERS) return w;
  } catch {}
  return DEFAULT_WORKER;
}

/** Bootstrap provider: the ONE read that cannot be anonymised (it locates the anon client).
 *  Tries each mainnet RPC in turn, so one dropped connection can't stop the private route from starting. */
const BOOTSTRAP_TIMEOUT_MS = 10_000;
const bootstrapProvider = {
  request: async ({ method, params }: { method: string; params?: unknown }) => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? [] });
    let lastErr: unknown;
    for (const url of BOOTSTRAP_RPCS) {
      const t0 = performance.now();
      const host = new URL(url).host;
      try {
        const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body, signal: AbortSignal.timeout(BOOTSTRAP_TIMEOUT_MS) });
        const json = await res.json();
        if (json.error || json.result === undefined) throw new Error(json.error?.message ?? `no result (${res.status})`);
        record({ method, label: "read worker specifier (mainnet)", isolationKey: "-", route: "bootstrap", ms: Math.round(performance.now() - t0), ok: true, endpoint: host, note: "not anonymised: happens before the anonymous client exists" });
        return json.result;
      } catch (e) {
        lastErr = e;
        record({ method, label: "read worker specifier (mainnet)", isolationKey: "-", route: "bootstrap", ms: Math.round(performance.now() - t0), ok: false, endpoint: host, note: `${String((e as Error)?.message ?? e).slice(0, 60)} - trying the next RPC` });
      }
    }
    throw lastErr;
  },
};

/** A worker that hasn't bootstrapped by then is treated as failed (e.g. its gateway is down).
 *  Tor normally bootstraps in 5-20 s; Nym is the last resort and downloads an ~18 MB bundle, so it gets longer. */
const BOOT_DEADLINE_MS: Record<WorkerId, number> = { "tor-js": 35_000, nym: 90_000, passthrough: 35_000 };
/** If Tor can't bootstrap, fall back to another network that also anonymises - never to passthrough. */
const ANON_FALLBACK: Partial<Record<WorkerId, WorkerId>> = { "tor-js": "nym" };
let instance: AnonWorker | undefined; // the most recently constructed worker (ready or not)
let generation = 0;

/** When every private route fails (a gateway blip, a dropped connection), try again by itself a few times before
 *  leaving it to the user. Still private: it only retries Tor/Nym, never reads directly. */
const AUTO_RETRY_MS = [5_000, 20_000, 60_000];
let autoRetry = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let wasDown = false;
function scheduleRetry(delay: number, id: WorkerId) {
  clearTimeout(retryTimer);
  const gen = generation;
  retryTimer = setTimeout(() => {
    if (gen !== generation || status.state !== "failed" || directAllowed()) return;
    autoRetry++;
    workerPromise = undefined;
    // retry the network the chain ended on (Nym after a Tor fallback), not the one that already failed first
    startWorker(id, true).catch(() => {});
  }, delay);
}

/** Fires when reads can work again after the route was down (a retry got through, or the user chose direct reads),
 *  so screens re-read at once instead of waiting for their next poll. */
const routeListeners = new Set<() => void>();
export function onRouteUp(l: () => void) {
  routeListeners.add(l);
  return () => {
    routeListeners.delete(l);
  };
}
function routeUp() {
  routeListeners.forEach((l) => l());
}

export function startWorker(id: WorkerId = storedWorker(), isFallback = false): Promise<AnonWorker> {
  if (workerPromise && status.worker === id) return workerPromise;
  instance?.close(); // tear down the previous sandbox, even if it never became ready
  instance = undefined;
  const gen = ++generation;
  status = { worker: id, state: "booting", retry: autoRetry || undefined };
  emit();
  const t0 = performance.now();
  workerPromise = (async () => {
    const { AnonRpcWorker } = await import("@anon-rpc/browser-harness");
    const w = new AnonRpcWorker({
      address: WORKERS[id].specifier,
      config: WORKERS[id].config as never,
      preExisting: { rpcProvider: bootstrapProvider as never },
    }) as unknown as AnonWorker;
    instance = w;
    try {
      await Promise.race([
        w.ready,
        new Promise((_, rej) => setTimeout(() => rej(new Error(`${WORKERS[id].label} did not bootstrap within ${BOOT_DEADLINE_MS[id] / 1000} s (gateway unreachable?)`)), BOOT_DEADLINE_MS[id])),
      ]);
    } catch (e) {
      if (gen !== generation) throw e; // superseded by a newer worker
      const msg = String((e as Error)?.message ?? e);
      const next = ANON_FALLBACK[id];
      if (next && !isFallback) {
        record({ method: "-", label: `${WORKERS[id].label} failed, falling back to ${WORKERS[next].label}`, isolationKey: "-", route: "anon-rpc", worker: id, ms: Math.round(performance.now() - t0), ok: false, endpoint: "-", note: msg.slice(0, 120) });
        workerPromise = undefined;
        return startWorker(next, true);
      }
      wasDown = true;
      const delay = AUTO_RETRY_MS[autoRetry];
      status = { worker: id, state: "failed", error: msg, retry: autoRetry || undefined, retryAt: delay === undefined ? undefined : Date.now() + delay };
      if (delay !== undefined) scheduleRetry(delay, id);
      emit();
      throw e;
    }
    if (gen !== generation) throw new Error("superseded");
    status = { worker: id, state: "ready", bootMs: Math.round(performance.now() - t0) };
    autoRetry = 0;
    clearTimeout(retryTimer);
    emit();
    if (wasDown) {
      wasDown = false;
      routeUp();
    }
    return w;
  })();
  return workerPromise;
}

/**
 * The user's explicit choice, offered only after every anonymity network failed: read directly from a public RPC,
 * NOT privately, for this browser session. Every such read is logged with route "direct" (the Privacy page counts it
 * as not private). retryPrivate() goes back to the anonymity networks.
 */
export function allowDirect() {
  try { sessionStorage.setItem("tenbin.direct", "1"); } catch {}
  clearTimeout(retryTimer);
  status = { ...status, direct: true, retryAt: undefined };
  emit();
  routeUp();
}
export function retryPrivate() {
  try { sessionStorage.removeItem("tenbin.direct"); } catch {}
  status = { ...status, direct: false };
  workerPromise = undefined;
  generation++;
  autoRetry = 0;
  return startWorker(storedWorker());
}
function directAllowed() {
  if (status.direct) return true;
  try { if (sessionStorage.getItem("tenbin.direct") === "1") { status = { ...status, direct: true }; return true; } } catch {}
  return false;
}

export function switchWorker(id: WorkerId) {
  try {
    localStorage.setItem("tenbin.worker", id);
  } catch {}
  workerPromise = undefined;
  return startWorker(id, true);
}

// ------------------------------------------------------------------------------------------------
// JSON-RPC
// ------------------------------------------------------------------------------------------------

/** Reads in a row where every RPC failed through a ready route, before the route counts as stalled. */
const STALL_READS = 3;
let stalledReads = 0;
function markStalled(id: WorkerId) {
  const msg = `${WORKERS[id].label} connected but stopped answering (${STALL_READS} reads in a row timed out); reconnecting`;
  stalledReads = 0;
  wasDown = true;
  workerPromise = Promise.reject(new Error(msg));
  workerPromise.catch(() => {});
  const delay = AUTO_RETRY_MS[autoRetry] ?? AUTO_RETRY_MS[AUTO_RETRY_MS.length - 1];
  status = { worker: id, state: "failed", error: msg, retry: autoRetry || undefined, retryAt: Date.now() + delay };
  scheduleRetry(delay, id);
  emit();
}

/** The anonymous client for a read. If every network just failed and an automatic retry is scheduled, the read waits
 *  for that retry instead of failing; if the user picks direct reads meanwhile, it switches at once. */
async function privateWorker(): Promise<AnonWorker | "direct"> {
  for (;;) {
    if (directAllowed()) return "direct";
    try {
      return await (workerPromise ?? startWorker());
    } catch (e) {
      if (status.state !== "failed" || !status.retryAt) throw e;
      await new Promise<void>((resolve) => {
        const done = () => {
          off();
          clearTimeout(t);
          resolve();
        };
        const off = subscribe(done);
        const t = setTimeout(done, Math.max(0, status.retryAt! - Date.now()) + 100);
      });
    }
  }
}

let rpcId = 1;
/** Anonymity networks are slow; past this, try the next RPC instead of hanging the UI. */
const REQUEST_TIMEOUT_MS = 25_000;

async function postJson(
  doFetch: (url: string, init: RequestInit & { anonOptions?: { isolationKey?: string } }) => Promise<Response>,
  url: string,
  body: string,
  isolationKey: string,
) {
  const res = await doFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    anonOptions: { isolationKey },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    // e.g. a Cloudflare challenge page served to a Tor exit
    throw new NonJsonError(`non-JSON response (${res.status}) from ${new URL(url).host}`);
  }
}
class NonJsonError extends Error {}

export async function rpc(method: string, params: unknown[], scope: { label: string; key: string }): Promise<unknown> {
  const body = JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params });
  const t0 = performance.now();

  if (NETWORK === "local") {
    const url = RPC_URLS[0];
    try {
      const json = await postJson((u, i) => fetch(u, i), url, body, scope.key);
      record({ method, label: scope.label, isolationKey: scope.key, route: "local-direct", ms: Math.round(performance.now() - t0), ok: !json.error, endpoint: url });
      if (json.error) throw Object.assign(new Error(json.error.message), { code: json.error.code, data: json.error.data });
      return json.result;
    } catch (e) {
      if (!(e as { code?: number }).code) record({ method, label: scope.label, isolationKey: scope.key, route: "local-direct", ms: Math.round(performance.now() - t0), ok: false, endpoint: url });
      throw e;
    }
  }

  const readDirect = async () => {
    // the user chose this after every anonymity network failed; logged as not private
    let lastDirect: unknown;
    for (const url of RPC_URLS) {
      try {
        const json = await postJson((u, i) => fetch(u, i), url, body, scope.key);
        record({ method, label: scope.label, isolationKey: scope.key, route: "direct", ms: Math.round(performance.now() - t0), ok: !json.error, endpoint: new URL(url).host, note: "not private (your choice)" });
        if (json.error) throw Object.assign(new Error(json.error.message), { code: json.error.code, data: json.error.data, rpc: true });
        return json.result;
      } catch (e) {
        if ((e as { rpc?: boolean }).rpc) throw e;
        lastDirect = e;
      }
    }
    throw lastDirect;
  };

  const w = await privateWorker();
  if (w === "direct") return readDirect();
  const bootedFrom = workerPromise;
  let lastErr: unknown;
  for (const url of RPC_URLS) {
    try {
      const json = await postJson(w.fetch, url, body, scope.key);
      stalledReads = 0;
      record({ method, label: scope.label, isolationKey: scope.key, route: "anon-rpc", worker: status.worker, ms: Math.round(performance.now() - t0), ok: !json.error, endpoint: new URL(url).host });
      if (json.error) throw Object.assign(new Error(json.error.message), { code: json.error.code, data: json.error.data, rpc: true });
      return json.result;
    } catch (e) {
      if ((e as { rpc?: boolean }).rpc) throw e; // a real JSON-RPC error (e.g. revert) - don't retry elsewhere
      lastErr = e;
      record({ method, label: scope.label, isolationKey: scope.key, route: "anon-rpc", worker: status.worker, ms: Math.round(performance.now() - t0), ok: false, endpoint: new URL(url).host, note: String((e as Error).message).slice(0, 80) + " - retrying next RPC" });
    }
  }
  // every RPC failed through this route: after a few such reads in a row the route is up but carrying nothing
  // (seen on Nym, 7 Nov). Reconnect (a new client picks a new route) instead of timing out forever.
  if (++stalledReads >= STALL_READS && workerPromise === bootedFrom && status.state === "ready") markStalled(status.worker);
  throw lastErr;
}

// ------------------------------------------------------------------------------------------------
// viem clients, one per isolation scope
// ------------------------------------------------------------------------------------------------

const clients = new Map<string, PublicClient>();

/**
 * scope.key is the isolation key: "maker:<addr>", "strategy:<hook>:<pair>", "trader:<addr>" or "public".
 */
export function readClient(label: string, key: string): PublicClient {
  const id = `${label}|${key}`;
  let c = clients.get(id);
  if (!c) {
    c = createPublicClient({
      chain: CHAIN,
      transport: custom({ request: ({ method, params }) => rpc(method, (params as unknown[]) ?? [], { label, key }) }),
      pollingInterval: NETWORK === "local" ? 1_000 : 4_000,
      batch: { multicall: false },
    }) as PublicClient;
    clients.set(id, c);
  }
  return c;
}

export const keys = {
  maker: (a?: string) => `maker:${(a ?? "none").toLowerCase()}`,
  strategy: (hook: string, a: string, b: string) => `strategy:${hook.slice(0, 10)}:${a.slice(0, 8)}-${b.slice(0, 8)}`.toLowerCase(),
  trader: (a?: string) => `trader:${(a ?? "anon").toLowerCase()}`,
  public: "public",
};

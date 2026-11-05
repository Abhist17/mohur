"use client";

import { createPublicClient, custom, type PublicClient } from "viem";
import { BOOTSTRAP_RPC, CHAIN, NETWORK, RPC_URLS, WORKERS, type WorkerId } from "./config";

/**
 * Every chain read the app makes goes through ONE function: `rpc()` below.
 *  - base-sepolia: through the Ethereum Foundation's anon-rpc harness (Tor by default), with an isolation key
 *    per scope (maker / strategy / trader / public), so reads about different things can't be linked.
 *  - local fork: straight to the local node (no anonymity network can reach localhost) - the UI says so.
 * Each call is recorded in the read log that the Privacy screen renders.
 */

export type ReadRoute = "anon-rpc" | "local-direct" | "bootstrap";

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

export type AnonStatus = { worker: WorkerId; state: "idle" | "booting" | "ready" | "failed"; bootMs?: number; error?: string };

type Listener = () => void;
const listeners = new Set<Listener>();
const log: ReadLogEntry[] = [];
let nextId = 1;
let status: AnonStatus = { worker: "tor-js", state: "idle" };

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
let worker: AnonWorker | undefined;
let workerPromise: Promise<AnonWorker> | undefined;

function storedWorker(): WorkerId {
  try {
    const w = localStorage.getItem("mohur.worker") as WorkerId | null;
    if (w && w in WORKERS) return w;
  } catch {}
  return "tor-js";
}

/** Bootstrap provider: the ONE read that cannot be anonymised (it locates the anon client). */
const bootstrapProvider = {
  request: async ({ method, params }: { method: string; params?: unknown }) => {
    const t0 = performance.now();
    const res = await fetch(BOOTSTRAP_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? [] }),
    });
    const json = await res.json();
    record({
      method,
      label: "read worker specifier (mainnet)",
      isolationKey: "-",
      route: "bootstrap",
      ms: Math.round(performance.now() - t0),
      ok: !json.error,
      endpoint: BOOTSTRAP_RPC,
      note: "not anonymised: happens before the anonymous client exists",
    });
    if (json.error) throw new Error(json.error.message);
    return json.result;
  },
};

export function startWorker(id: WorkerId = storedWorker()): Promise<AnonWorker> {
  if (workerPromise && status.worker === id) return workerPromise;
  worker?.close();
  worker = undefined;
  status = { worker: id, state: "booting" };
  emit();
  const t0 = performance.now();
  workerPromise = (async () => {
    const { AnonRpcWorker } = await import("@anon-rpc/browser-harness");
    const w = new AnonRpcWorker({
      address: WORKERS[id].specifier,
      config: WORKERS[id].config as never,
      preExisting: { rpcProvider: bootstrapProvider as never },
    }) as unknown as AnonWorker;
    try {
      await w.ready;
    } catch (e) {
      status = { worker: id, state: "failed", error: String((e as Error)?.message ?? e) };
      emit();
      throw e;
    }
    worker = w;
    status = { worker: id, state: "ready", bootMs: Math.round(performance.now() - t0) };
    emit();
    return w;
  })();
  return workerPromise;
}

export function switchWorker(id: WorkerId) {
  try {
    localStorage.setItem("mohur.worker", id);
  } catch {}
  workerPromise = undefined;
  return startWorker(id);
}

// ------------------------------------------------------------------------------------------------
// JSON-RPC
// ------------------------------------------------------------------------------------------------

let rpcId = 1;

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

  const w = await startWorker();
  let lastErr: unknown;
  for (const url of RPC_URLS) {
    try {
      const json = await postJson(w.fetch, url, body, scope.key);
      record({ method, label: scope.label, isolationKey: scope.key, route: "anon-rpc", worker: status.worker, ms: Math.round(performance.now() - t0), ok: !json.error, endpoint: new URL(url).host });
      if (json.error) throw Object.assign(new Error(json.error.message), { code: json.error.code, data: json.error.data, rpc: true });
      return json.result;
    } catch (e) {
      if ((e as { rpc?: boolean }).rpc) throw e; // a real JSON-RPC error (e.g. revert) - don't retry elsewhere
      lastErr = e;
      record({ method, label: scope.label, isolationKey: scope.key, route: "anon-rpc", worker: status.worker, ms: Math.round(performance.now() - t0), ok: false, endpoint: new URL(url).host, note: String((e as Error).message).slice(0, 80) + " - retrying next RPC" });
    }
  }
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

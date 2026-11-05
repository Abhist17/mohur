"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createWalletClient, custom, http, numberToHex, type Abi, type Address, type Hash, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN, EXPLORER, NETWORK, RPC_URLS } from "./config";
import { ALL_ERRORS, prettyError } from "./errors";
import { useToast } from "@/components/Toast";
import { keys, readClient } from "./anon";

/** Anvil's well-known dev keys - only offered on the local fork. */
const LOCAL_KEYS: { label: string; key: `0x${string}` }[] = [
  { label: "Dev #1 (demo maker)", key: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" },
  { label: "Dev #2 (trader)", key: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" },
  { label: "Dev #3 (new maker)", key: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" },
];

type EthProvider = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown>; on?: (e: string, f: (...a: unknown[]) => void) => void };

type Wallet = {
  account?: Address;
  kind?: "injected" | "local";
  client?: WalletClient;
  connecting: boolean;
  error?: string;
  localAccounts: typeof LOCAL_KEYS;
  connectInjected(): Promise<void>;
  connectLocal(i: number): void;
  disconnect(): void;
  /** Send a contract write from the connected wallet; wait for the receipt over the (anonymised) read path. */
  write(args: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[]; label: string }): Promise<Hash>;
};

const Ctx = createContext<Wallet | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Address>();
  const [kind, setKind] = useState<Wallet["kind"]>();
  const [client, setClient] = useState<WalletClient>();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string>();
  const toast = useToast();

  const connectLocal = useCallback((i: number) => {
    const acct = privateKeyToAccount(LOCAL_KEYS[i].key);
    setClient(createWalletClient({ account: acct, chain: CHAIN, transport: http(RPC_URLS[0]) }));
    setAccount(acct.address);
    setKind("local");
    try {
      localStorage.setItem("mohur.wallet", `local:${i}`);
    } catch {}
  }, []);

  const connectInjected = useCallback(async () => {
    const eth = (globalThis as unknown as { ethereum?: EthProvider }).ethereum;
    if (!eth) {
      setError("No browser wallet found");
      return;
    }
    setConnecting(true);
    setError(undefined);
    try {
      const [a] = (await eth.request({ method: "eth_requestAccounts" })) as Address[];
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: numberToHex(CHAIN.id) }] });
      } catch {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [{ chainId: numberToHex(CHAIN.id), chainName: CHAIN.name, nativeCurrency: CHAIN.nativeCurrency, rpcUrls: CHAIN.rpcUrls.default.http }],
        });
      }
      setClient(createWalletClient({ account: a, chain: CHAIN, transport: custom(eth) }));
      setAccount(a);
      setKind("injected");
      try {
        localStorage.setItem("mohur.wallet", "injected");
      } catch {}
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAccount(undefined);
    setClient(undefined);
    setKind(undefined);
    try {
      localStorage.removeItem("mohur.wallet");
    } catch {}
  }, []);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("mohur.wallet");
    } catch {}
    if (saved?.startsWith("local:") && NETWORK === "local") connectLocal(Number(saved.split(":")[1]));
  }, [connectLocal]);

  const write = useCallback<Wallet["write"]>(
    async ({ address, abi, functionName, args, label }) => {
      if (!client || !account) throw new Error("Connect a wallet first");
      const id = toast.push({ kind: "pending", title: label, body: kind === "local" ? "Sending…" : "Confirm in your wallet…" });
      try {
        const reader = readClient(`tx receipt: ${label}`, keys.maker(account));
        // simulate first through the read path: a revert surfaces as a readable reason, before any signature
        await reader.simulateContract({ address, abi: [...abi, ...ALL_ERRORS], functionName, args, account } as never);
        const hash = await client.writeContract({ address, abi, functionName, args, account, chain: CHAIN } as never);
        toast.update(id, { body: "Submitted. Waiting for confirmation…", href: EXPLORER ? `${EXPLORER}/tx/${hash}` : undefined });
        const receipt = await reader.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error(`${label} reverted`);
        toast.update(id, { kind: "success", body: "Confirmed" });
        return hash;
      } catch (e) {
        const msg = prettyError(e);
        toast.update(id, { kind: "error", body: msg });
        throw new Error(msg);
      }
    },
    [client, account, kind, toast],
  );

  const value = useMemo<Wallet>(
    () => ({ account, kind, client, connecting, error, localAccounts: NETWORK === "local" ? LOCAL_KEYS : [], connectInjected, connectLocal, disconnect, write }),
    [account, kind, client, connecting, error, connectInjected, connectLocal, disconnect, write],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet() {
  const v = useContext(Ctx);
  if (!v) throw new Error("WalletProvider missing");
  return v;
}

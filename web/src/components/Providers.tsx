"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { WalletProvider } from "@/lib/wallet";
import { getAnonStatus, getReadLog, startWorker, subscribe } from "@/lib/anon";
import { NETWORK } from "@/lib/config";

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (NETWORK === "base-sepolia") startWorker().catch(() => {});
  }, []);
  return <WalletProvider>{children}</WalletProvider>;
}

const emptyLog: ReturnType<typeof getReadLog> = [];
let snapshotVersion = 0;
let cachedLog = emptyLog;
subscribe(() => {
  snapshotVersion++;
});
let lastVersion = -1;

/** Live read log + anon status for components. */
export function useAnon() {
  const version = useSyncExternalStore(
    subscribe,
    () => snapshotVersion,
    () => 0,
  );
  if (version !== lastVersion) {
    cachedLog = [...getReadLog()];
    lastVersion = version;
  }
  return { log: typeof window === "undefined" ? emptyLog : cachedLog, status: getAnonStatus(), version };
}

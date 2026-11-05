"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { deployment } from "@/lib/config";
import { hookOf } from "@/lib/mohur";
import { useWallet } from "@/lib/wallet";

/** The index being viewed: the connected maker's own hook if they launched one, else the demo index.
 *  `preferDemo` (e.g. on Swap, where you want a counterparty) shows the demo index unless asked otherwise. */
export function useIndex(preferDemo = false) {
  const { account } = useWallet();
  const d = deployment();
  const [own, setOwn] = useState<Address>();
  useEffect(() => {
    setOwn(undefined);
    if (account) hookOf(account).then(setOwn).catch(() => {});
  }, [account]);
  const useOwn = !!own && (!preferDemo || !d?.demoHook);
  const hook = useOwn ? own : d?.demoHook ?? own;
  const maker = useOwn ? account : d?.demoMaker;
  return { hook, maker, isOwn: useOwn, hasOwn: !!own, ownHook: own, deployed: !!d };
}

export function usePoll(fn: () => void | Promise<void>, ms: number, deps: unknown[]) {
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        await fn();
      } catch {}
    };
    tick();
    const id = setInterval(() => alive && tick(), ms);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

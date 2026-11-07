"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { deployment } from "@/lib/config";
import { hookOf, TenbinHookAbi } from "@/lib/tenbin";
import { keys, onRouteUp, readClient } from "@/lib/anon";
import { useWallet } from "@/lib/wallet";

/** The index being viewed: one picked by link (?index=0x… from Explore), else the connected maker's own hook,
 *  else the demo index. `preferDemo` (e.g. on Swap, where you want a counterparty) prefers the demo over your own. */
export function useIndex(preferDemo = false) {
  const { account } = useWallet();
  const d = deployment();
  const [own, setOwn] = useState<Address>();
  const [picked, setPicked] = useState<{ hook: Address; maker: Address }>();
  useEffect(() => {
    setOwn(undefined);
    if (account) hookOf(account).then(setOwn).catch(() => {});
  }, [account]);
  useEffect(() => {
    const h = new URLSearchParams(window.location.search).get("index");
    if (!h || !/^0x[0-9a-fA-F]{40}$/.test(h)) return;
    readClient("picked index", keys.public)
      .readContract({ address: h as Address, abi: TenbinHookAbi, functionName: "maker" })
      .then((m) => setPicked({ hook: h as Address, maker: m as Address }))
      .catch(() => {});
  }, []);
  if (picked) {
    const mine = !!account && picked.maker.toLowerCase() === account.toLowerCase();
    return { hook: picked.hook, maker: picked.maker, isOwn: mine, hasOwn: !!own, ownHook: own, deployed: !!d, picked: true };
  }
  const useOwn = !!own && (!preferDemo || !d?.demoHook);
  const hook = useOwn ? own : d?.demoHook ?? own;
  const maker = useOwn ? account : d?.demoMaker;
  return { hook, maker, isOwn: useOwn, hasOwn: !!own, ownHook: own, deployed: !!d, picked: false };
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
    const off = onRouteUp(() => alive && tick()); // the read route came back after an outage: re-read now
    return () => {
      alive = false;
      clearInterval(id);
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

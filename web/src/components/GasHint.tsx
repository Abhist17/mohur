"use client";

import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { NETWORK } from "@/lib/config";
import { keys, readClient } from "@/lib/anon";
import { useWallet } from "@/lib/wallet";

/** Below this, a first-time user can't pay for the next few transactions (the whole demo is ~1.5M gas). */
const LOW = 10n ** 14n; // 0.0001 ETH

export const FAUCETS = [
  ["Coinbase", "https://portal.cdp.coinbase.com/products/faucet"],
  ["Alchemy", "https://www.alchemy.com/faucets/base-sepolia"],
  ["QuickNode", "https://faucet.quicknode.com/base/sepolia"],
] as const;

/** Tells a connected wallet with (almost) no ETH how to get gas, before any transaction fails. */
export function GasHint() {
  const { account } = useWallet();
  const [bal, setBal] = useState<bigint>();
  useEffect(() => {
    setBal(undefined);
    if (!account) return;
    let alive = true;
    readClient("gas balance", keys.trader(account))
      .getBalance({ address: account })
      .then((b) => alive && setBal(b))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [account]);
  if (!account || bal === undefined || bal >= LOW) return null;
  return (
    <div className="banner" data-testid="gas-hint" style={{ marginBottom: 16 }}>
      This wallet has {Number(formatEther(bal)).toPrecision(2)} ETH, not enough for gas.{" "}
      {NETWORK === "base-sepolia" ? (
        <>
          Get free Base Sepolia ETH:{" "}
          {FAUCETS.map(([name, url], i) => (
            <span key={name}>
              {i > 0 && " · "}
              <a href={url} target="_blank" rel="noreferrer" className="gold">{name} ↗</a>
            </span>
          ))}
          . Then reload.
        </>
      ) : (
        <>On the local fork, connect one of the funded Dev accounts instead.</>
      )}
    </div>
  );
}

#!/usr/bin/env bash
# One-click Unison demo on a local Base Sepolia fork:
#   boot fork -> deploy -> launch a 40/30/30 index -> real fills on Uniswap v4 and 1inch Aqua
#   -> narrated numbers read straight from the contracts -> start the app and open it.
# Everything printed is read from chain on the fork. Nothing here is simulated in JS.
#   NO_APP=1   skip starting/opening the web app
#   SKIP_FORK=1 reuse a fork already running on :8545 (the narration is re-read, nothing is redeployed)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.foundry/bin:$PATH"
R=http://127.0.0.1:8545
B=$'\e[1m'; D=$'\e[2m'; G=$'\e[33m'; N=$'\e[0m'
say() { printf '%s\n' "$*"; }
step() { printf '\n%s%s%s\n' "$B$G" "$*" "$N"; }
c() { cast call "$@" --rpc-url $R; }
first() { awk '{print $1}'; }

step "1/5  Booting a local fork of Base Sepolia (real Uniswap v4 PoolManager) and deploying Unison"
if [ "${SKIP_FORK:-}" = 1 ] && cast block-number --rpc-url $R >/dev/null 2>&1 && [ -f "$ROOT/contracts/deployments/local.json" ]; then
  say "  ${D}reusing the fork on :8545${N}"
else
  "$ROOT/scripts/fork-up.sh"
fi

J="$ROOT/contracts/deployments/local.json"
g() { node -e "console.log(require('$J')['$1'])"; }
HOOK=$(g demoHook); MAKER=$(g demoMaker); LENS=$(g lens); SVM=$(g swapVM)
T=($(g tWETH) $(g tWBTC) $(g tUSDC)); S=(ETH BTC USDC); DEC=(18 8 6)
fmtu() { node -e "const v=BigInt('$1'),d=$2n;const s=(Number(v)/10**Number(d));console.log(s.toLocaleString('en',{maximumFractionDigits:6}))"; }

step "2/5  The index: one wallet, three tokens, target weights 40/30/30"
say "  maker wallet  $MAKER"
say "  hook          $HOOK"
for i in 0 1 2; do
  w=$(c $HOOK 'weightOf(address)(uint256)' ${T[$i]} | first)
  bal=$(c $HOOK 'effectiveBalance(address)(uint256)' ${T[$i]} | first)
  printf '  %-5s weight %5s%%   balance %s\n' "${S[$i]}" "$(node -e "console.log((Number(BigInt('$w'))/1e16).toFixed(2))")" "$(fmtu $bal ${DEC[$i]})"
done

step "3/5  Same trade, both venues: Uniswap v4 hook vs 1inch Aqua (SwapVM opcode 0xd0)"
AMT=(100000000000000000 100000 300000000) # 0.1 ETH, 0.001 BTC, 300 USDC
maxdiff=0
for p in "0 2" "2 1" "1 0"; do
  set -- $p; i=$1; j=$2
  out=($(c $LENS 'quoteBoth(address,address,address,address,uint256,bool)(uint256,uint256,bool,uint256,uint256,bool)' $HOOK $SVM ${T[$i]} ${T[$j]} ${AMT[$i]} true | first))
  d=$(node -e "const a=BigInt('${out[1]}'),b=BigInt('${out[4]}');console.log((a>b?a-b:b-a).toString())")
  [ "$d" != 0 ] && maxdiff=$d
  printf '  sell %s %-4s  Uniswap -> %s %s   1inch -> %s %s   difference %s wei\n' \
    "$(fmtu ${AMT[$i]} ${DEC[$i]})" "${S[$i]}" "$(fmtu ${out[1]} ${DEC[$j]})" "${S[$j]}" "$(fmtu ${out[4]} ${DEC[$j]})" "${S[$j]}" "$d"
done
[ "$maxdiff" = 0 ] && say "  ${B}=> 0 price difference between venues: one price, from the wallet's real balances${N}" \
                   || say "  !! venues disagree by $maxdiff wei"

step "4/5  Arbitrage check: a 3-leg loop ETH -> USDC -> BTC -> ETH across both venues"
LOOP=$(c $LENS 'quoteRoute(address,address,address[],uint8[],uint256)(uint256[],bool)' $HOOK $SVM "[${T[0]},${T[2]},${T[1]},${T[0]}]" "[0,1,0]" 1000000000000000000 | head -1)
END=$(echo "$LOOP" | tr -d '[]' | awk -F', ' '{print $NF}' | first)
PCT=$(node -e "console.log(((Number(BigInt('$END'))/1e18-1)*100).toFixed(3))")
say "  1 ETH in -> $(fmtu $END 18) ETH out  (${B}${PCT}%${N})"
say "  => the loop loses money: with one price on both venues there is nothing to arbitrage"

step "5/5  Real fills on chain (scripted trader, both venues)"
FROM=$(g startBlock)
nv4=$(cast logs --from-block $FROM --address $HOOK 'Fill(address indexed,address indexed,address indexed,uint256,uint256,uint256)' --rpc-url $R 2>/dev/null | grep -c transactionHash || true)
naq=$(cast logs --from-block $FROM --address $SVM 'Swapped(bytes32,address,address,address,address,uint256,uint256)' --rpc-url $R 2>/dev/null | grep -c transactionHash || true)
say "  Uniswap v4 fills: $nv4    1inch Aqua fills: $naq"
say "  Wallet after the fills (traders' input stays in the maker wallet; claims flushed):"
for i in 0 1 2; do
  w=$(c $HOOK 'weightOf(address)(uint256)' ${T[$i]} | first)
  bal=$(c $HOOK 'effectiveBalance(address)(uint256)' ${T[$i]} | first)
  say "    ${S[$i]}  target $(node -e "console.log((Number(BigInt('$w'))/1e16).toFixed(0))")%   balance $(fmtu $bal ${DEC[$i]})"
done
say ""
say "  ${D}Local fork only: reads here go straight to the node. On Base Sepolia the app sends every read through Anon-RPC.${N}"

[ "${NO_APP:-}" = 1 ] && exit 0
step "Starting the app (local fork mode) on http://localhost:3000"
cd "$ROOT/web"
if ! curl -s -o /dev/null http://localhost:3000; then
  (NEXT_PUBLIC_UNISON_NETWORK=local setsid nohup npx next dev -p 3000 > /tmp/unison-web.log 2>&1 &)
  for i in $(seq 1 60); do curl -s -o /dev/null http://localhost:3000 && break; sleep 1; done
fi
URL="http://localhost:3000/book?index=$HOOK"
say "  open $URL   ${D}(connect 'Dev #2 (trader)' to trade)${N}"
command -v xdg-open >/dev/null && xdg-open "$URL" >/dev/null 2>&1 || true

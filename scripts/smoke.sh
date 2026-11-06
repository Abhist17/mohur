#!/usr/bin/env bash
# Read-only smoke test of a Unison deployment. Usage: scripts/smoke.sh [local|base-sepolia]
# Checks, on-chain: contracts exist, hook permission bits, index config, the SAME quote on both venues for
# every pair and direction, the maker's ONLY approval is Aqua, venue limits, the official V4Quoter agrees,
# and that fills happened on both venues.
set -uo pipefail
NET="${1:-base-sepolia}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
J="$ROOT/contracts/deployments/$NET.json"
[ -f "$J" ] || { echo "no deployment file: $J"; exit 1; }
case "$NET" in
  local) RPC="${RPC:-http://127.0.0.1:8545}" ;;
  *) RPC="${RPC:-https://base-sepolia-rpc.publicnode.com}" ;;
esac
export PATH="$HOME/.foundry/bin:$PATH"
g() { jq -r ".$1" "$J"; }
c() { cast call "$@" --rpc-url "$RPC" 2>/dev/null; }
first() { awk 'NR==1{print $1}'; }
PASS=0; FAIL=0
ok()  { echo "  PASS  $*"; PASS=$((PASS+1)); }
bad() { echo "  FAIL  $*"; FAIL=$((FAIL+1)); }
check() { if [ "$1" = "1" ]; then ok "$2"; else bad "$2"; fi; }

HOOK=$(g demoHook); MAKER=$(g demoMaker); LENS=$(g lens); SVM=$(g swapVM); AQUA=$(g aqua); PM=$(g poolManager)
T=($(g tWETH) $(g tWBTC) $(g tUSDC)); SYM=(tWETH tWBTC tUSDC); AMT=(100000000000000000 300000 300000000)
echo "Unison smoke test on $NET ($RPC)"

echo "contracts"
for k in aqua swapVM hookFactory lens loopRouter tWETH tWBTC tUSDC demoHook; do
  a=$(g $k); n=$(cast codesize "$a" --rpc-url "$RPC" 2>/dev/null || echo 0)
  check "$([ "${n:-0}" -gt 0 ] && echo 1)" "$k has code ($a)"
done

echo "hook"
low=$(( $(printf '%d' 0x${HOOK: -4}) & 0x3FFF ))
check "$([ "$low" = "$((0x2888))" ] && echo 1)" "address carries exactly beforeInitialize|beforeAddLiquidity|beforeSwap|beforeSwapReturnDelta"
check "$([ "$(c $HOOK 'maker()(address)' | tr A-Z a-z)" = "$(echo $MAKER | tr A-Z a-z)" ] && echo 1)" "maker is the demo maker"
sum=0; for t in "${T[@]}"; do w=$(c $HOOK 'weightOf(address)(uint256)' $t | first); sum=$(python3 -c "print($sum+$w)"); done
check "$(python3 -c "print(1 if abs($sum-10**18)<=10 else '')")" "weights sum to 100% (±10 wei while a gradual re-weight interpolates)"

echo "same price on both venues (exact-in, every direction)"
for i in 0 1 2; do for j in 0 1 2; do [ $i = $j ] && continue
  out=$(c $LENS 'quoteBoth(address,address,address,address,uint256,bool)(uint256,uint256,bool,uint256,uint256,bool)' $HOOK $SVM ${T[$i]} ${T[$j]} ${AMT[$i]} true | awk '{print $1}' | tr '\n' ' ')
  set -- $out
  check "$([ "$2" = "$5" ] && [ "$3" = "true" ] && [ "$6" = "true" ] && [ "$2" != "0" ] && echo 1)" "${SYM[$i]} -> ${SYM[$j]}: uniswap $2 == 1inch $5"
done; done

echo "approvals (the maker's only approval is Aqua)"
for t in "${T[@]}"; do
  aq=$(c $t 'allowance(address,address)(uint256)' $MAKER $AQUA | first)
  check "$([ "$aq" != "0" ] && echo 1)" "$(c $t 'symbol()(string)' | tr -d '"'): Aqua approved"
  for s in $HOOK $SVM $PM; do
    v=$(c $t 'allowance(address,address)(uint256)' $MAKER $s | first)
    check "$([ "$v" = "0" ] && echo 1)" "  no allowance to $s"
  done
done

echo "venue limits"
for t in "${T[@]}"; do
  v=$(c $HOOK 'venueLimit(address)(uint256)' $t | first)
  check "$([ "${v:-0}" != "0" ] && echo 1)" "uniswap venue may sell $(c $t 'symbol()(string)' | tr -d '"'): $v"
done

echo "official Uniswap V4Quoter agrees with the hook"
Q=0x4A6513c898fe1B2d0E78d3b0e0A4a151589B1cBa
if [ "$(cast codesize $Q --rpc-url $RPC 2>/dev/null || echo 0)" -gt 0 ]; then
  a=${T[0]}; b=${T[2]}; zf=$( [ "$(echo $a | tr A-Z a-z)" \< "$(echo $b | tr A-Z a-z)" ] && echo true || echo false)
  if [ $zf = true ]; then c0=$a; c1=$b; else c0=$b; c1=$a; fi
  qo=$(cast call $Q 'quoteExactInputSingle(((address,address,uint24,int24,address),bool,uint128,bytes))(uint256,uint256)' "(($c0,$c1,0,60,$HOOK),$zf,100000000000000000,0x)" --rpc-url $RPC 2>/dev/null | first)
  ho=$(c $HOOK 'quote(address,address,uint256,bool)(uint256,uint256)' $a $b 100000000000000000 true | awk 'NR==2{print $1}')
  check "$([ -n "$qo" ] && [ "$qo" = "$ho" ] && echo 1)" "V4Quoter $qo == hook $ho (0.1 tWETH -> tUSDC)"
else echo "  skip  no V4Quoter on this chain"; fi

echo "fills happened"
SB=$(g startBlock); HEAD=$(cast block-number --rpc-url $RPC)
FROM=$(( HEAD - SB > 40000 ? HEAD - 40000 : SB ))
nv4=$(cast logs --from-block $FROM --to-block $HEAD --address $HOOK 'Fill(address indexed,address indexed,address indexed,uint256,uint256,uint256)' --rpc-url $RPC --json 2>/dev/null | jq length)
nsw=$(cast logs --from-block $FROM --to-block $HEAD --address $SVM 'Swapped(bytes32,address,address,address,address,uint256,uint256)' --rpc-url $RPC --json 2>/dev/null | jq length)
check "$([ "${nv4:-0}" -gt 0 ] && echo 1)" "uniswap fills: ${nv4:-0}"
check "$([ "${nsw:-0}" -gt 0 ] && echo 1)" "1inch fills: ${nsw:-0}"

echo; echo "$PASS passed, $FAIL failed"
[ $FAIL -eq 0 ]

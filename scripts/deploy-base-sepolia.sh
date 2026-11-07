#!/usr/bin/env bash
# One-command Base Sepolia deploy of Tenbin, end to end:
#   1. shared contracts (official Aqua source, TenbinSwapVMRouter, hook factory, lens, loop router, test tokens)
#   2. a 40/30/30 demo index launched from your wallet (hook, approvals, weights, v4 pools, Aqua strategies)
#   3. real demo fills on both venues
#   4. sync the web app, run the on-chain smoke test, commit + push (GitHub Pages then rebuilds the live site)
#
# One-time setup (stored encrypted by Foundry; the key is never printed):
#   ./scripts/setup-deployer.sh            (fresh testnet wallet)   or   cast wallet import tenbin-deployer --interactive
# Then fund that address with ~0.01 Base Sepolia ETH and run:
#   ./scripts/deploy-base-sepolia.sh
# Optional: PASSWORD_FILE=<file with the keystore password>  ACCOUNT=<keystore name>  RPC=<rpc url, default: first of publicnode / sepolia.base.org / drpc that answers>  FRESH=1 (redeploy everything)  NO_PUSH=1
set -euo pipefail
ACCOUNT="${ACCOUNT:-tenbin-deployer}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
J="$ROOT/contracts/deployments/base-sepolia.json"
export PATH="$HOME/.foundry/bin:$PATH"

say() { printf "\n\033[1;33m== %s\033[0m\n" "$*"; }
for bin in forge cast jq node npm; do command -v $bin >/dev/null || { echo "missing: $bin"; exit 1; }; done
cast wallet list 2>/dev/null | grep -q "^$ACCOUNT" || {
  echo "No Foundry keystore account '$ACCOUNT'. Create a fresh testnet deployer (you choose a password):"
  echo "  ./scripts/setup-deployer.sh"
  echo "or import a testnet key you already have:"
  echo "  cast wallet import $ACCOUNT --interactive"; exit 1; }

# PASSWORD_FILE: lets the deploy run unattended (the key stays encrypted; the password file stays on your machine, chmod 600)
PW=(); [ -n "${PASSWORD_FILE:-}" ] && PW=(--password-file "$PASSWORD_FILE")
SENDER=$(cast wallet address --account "$ACCOUNT" "${PW[@]}")
# pick the first Base Sepolia RPC that answers (sepolia.base.org times out from some networks); RPC=<url> overrides
if [ -z "${RPC:-}" ]; then
  for r in https://base-sepolia-rpc.publicnode.com https://sepolia.base.org https://base-sepolia.drpc.org; do
    if [ "$(timeout 15 cast chain-id --rpc-url "$r" 2>/dev/null)" = "84532" ]; then RPC=$r; break; fi
    echo "  $r did not answer, trying the next RPC"
  done
  [ -n "${RPC:-}" ] || { echo "No Base Sepolia RPC answered. Check your connection, or pass RPC=<url>."; exit 1; }
fi
CHAIN=$(cast chain-id --rpc-url "$RPC")
[ "$CHAIN" = "84532" ] || { echo "RPC is chain $CHAIN, expected Base Sepolia (84532)"; exit 1; }
echo "  using RPC $RPC"
BAL=$(cast balance "$SENDER" --rpc-url "$RPC")
say "deployer / maker / demo trader: $SENDER  balance: $(cast from-wei "$BAL") ETH"
low() { [ "$(python3 -c "print(int(int('${1:-0}' or 0) < 5*10**15))")" = "1" ]; }
if low "$BAL"; then
  echo
  echo "  This wallet needs at least 0.005 Base Sepolia ETH (the deploy uses ~0.0002)."
  echo "  Send 0.01 ETH on Base Sepolia to:"
  echo
  echo "      $SENDER"
  echo
  echo "  from MetaMask (network: Base Sepolia), or a faucet:"
  echo "      https://portal.cdp.coinbase.com/products/faucet"
  echo "      https://www.alchemy.com/faucets/base-sepolia"
  echo "      https://faucet.quicknode.com/base/sepolia"
  [ -n "${NO_WAIT:-}" ] && exit 1
  echo
  echo "  Waiting for it to arrive (checks every 10 s; Ctrl+C to stop). The deploy continues by itself."
  for _ in $(seq 1 360); do
    sleep 10
    BAL=$(cast balance "$SENDER" --rpc-url "$RPC" 2>/dev/null || echo 0)
    low "$BAL" || break
    printf "."
  done
  echo
  low "$BAL" && { echo "  Still unfunded after an hour. Run this again once the ETH has arrived."; exit 1; }
  say "funded: $(cast from-wei "$BAL") ETH"
fi

cd "$ROOT/contracts"
[ -d lib/v4-periphery/lib/v4-core/out ] || npm run build:v4 >/dev/null
run() { forge script "script/$1.s.sol" --rpc-url "$RPC" --account "$ACCOUNT" "${PW[@]}" --sender "$SENDER" --broadcast --slow; }

if [ -n "${FRESH:-}" ] || [ ! -f "$J" ] || [ "$(jq -r '.lens // empty' "$J")" = "" ]; then
  say "1/4 deploying shared contracts"; run DeployTenbin
else say "1/4 shared contracts already deployed (FRESH=1 to redeploy)"; fi

if [ -n "${FRESH:-}" ] || [ "$(jq -r '.demoHook // empty' "$J")" = "" ]; then
  say "2/4 launching the 40/30/30 demo index"; run LaunchIndex
else say "2/4 demo index already launched"; fi

say "3/4 demo fills on both venues"; run DemoTrades

say "4/4 sync web app + on-chain smoke test"
cd "$ROOT/web" && npm run sync
"$ROOT/scripts/smoke.sh" base-sepolia

if [ -z "${NO_PUSH:-}" ]; then
  cd "$ROOT"
  git add contracts/deployments/base-sepolia.json web/src/generated contracts/broadcast 2>/dev/null || true
  git commit -qm "Deploy Tenbin to Base Sepolia (demo index $(jq -r .demoHook "$J"))" && git push -q && \
    echo "pushed: the live site rebuilds at https://abhist17.github.io/tenbin/ in ~2 minutes"
fi
say "done. addresses: contracts/deployments/base-sepolia.json"

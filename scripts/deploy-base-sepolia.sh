#!/usr/bin/env bash
# One-command Base Sepolia deploy of Mohur, end to end:
#   1. shared contracts (official Aqua source, MohurSwapVMRouter, hook factory, lens, loop router, test tokens)
#   2. a 40/30/30 demo index launched from your wallet (hook, approvals, weights, v4 pools, Aqua strategies)
#   3. real demo fills on both venues
#   4. sync the web app, run the on-chain smoke test, commit + push (GitHub Pages then rebuilds the live site)
#
# One-time setup (you type the key yourself; it is stored encrypted by Foundry):
#   cast wallet import mohur-deployer --interactive
# Then fund that address with ~0.01 Base Sepolia ETH and run:
#   ./scripts/deploy-base-sepolia.sh
# Optional: PASSWORD_FILE=<file with the keystore password>  ACCOUNT=<keystore name>  RPC=<rpc url>  FRESH=1 (redeploy everything)  NO_PUSH=1
set -euo pipefail
ACCOUNT="${ACCOUNT:-mohur-deployer}"
RPC="${RPC:-https://sepolia.base.org}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
J="$ROOT/contracts/deployments/base-sepolia.json"
export PATH="$HOME/.foundry/bin:$PATH"

say() { printf "\n\033[1;33m== %s\033[0m\n" "$*"; }
for bin in forge cast jq node npm; do command -v $bin >/dev/null || { echo "missing: $bin"; exit 1; }; done
cast wallet list 2>/dev/null | grep -q "^$ACCOUNT" || {
  echo "No Foundry keystore account '$ACCOUNT'. Create it (you type the key):"
  echo "  cast wallet import $ACCOUNT --interactive"; exit 1; }

# PASSWORD_FILE: lets the deploy run unattended (the key stays encrypted; the password file stays on your machine, chmod 600)
PW=(); [ -n "${PASSWORD_FILE:-}" ] && PW=(--password-file "$PASSWORD_FILE")
SENDER=$(cast wallet address --account "$ACCOUNT" "${PW[@]}")
CHAIN=$(cast chain-id --rpc-url "$RPC")
[ "$CHAIN" = "84532" ] || { echo "RPC is chain $CHAIN, expected Base Sepolia (84532)"; exit 1; }
BAL=$(cast balance "$SENDER" --rpc-url "$RPC")
say "deployer / maker / demo trader: $SENDER  balance: $(cast from-wei "$BAL") ETH"
if [ "$(python3 -c "print(int($BAL < 5*10**15))")" = "1" ]; then
  echo "Need at least 0.005 Base Sepolia ETH. Faucets:"
  echo "  https://portal.cdp.coinbase.com/products/faucet"
  echo "  https://www.alchemy.com/faucets/base-sepolia"
  echo "  https://faucet.quicknode.com/base/sepolia"
  exit 1
fi

cd "$ROOT/contracts"
[ -d lib/v4-periphery/lib/v4-core/out ] || npm run build:v4 >/dev/null
run() { forge script "script/$1.s.sol" --rpc-url "$RPC" --account "$ACCOUNT" "${PW[@]}" --sender "$SENDER" --broadcast --slow; }

if [ -n "${FRESH:-}" ] || [ ! -f "$J" ] || [ "$(jq -r '.lens // empty' "$J")" = "" ]; then
  say "1/4 deploying shared contracts"; run DeployMohur
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
  git commit -qm "Deploy Mohur to Base Sepolia (demo index $(jq -r .demoHook "$J"))" && git push -q && \
    echo "pushed: the live site rebuilds at https://abhist17.github.io/mohur/ in ~2 minutes"
fi
say "done. addresses: contracts/deployments/base-sepolia.json"

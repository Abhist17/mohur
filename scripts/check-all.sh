#!/usr/bin/env bash
# Everything, end to end, on a fresh local fork of Base Sepolia:
#   1. contract tests (incl. invariants, audit PoC, live fork tests)   2. web type-check + lint
#   3. fresh anvil fork -> deploy, launch demo index, demo fills       4. 36 on-chain smoke checks
#   5. headless user flows (Launch, Swap both venues, Arbitrage, re-weight, pause/resume, friendly errors)
# Usage: ./scripts/check-all.sh        (restarts the anvil on :8545)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.foundry/bin:$PATH"
R=http://127.0.0.1:8545
step() { printf "\n\033[1;33m== %s\033[0m\n" "$*"; }

step "1/5 contract tests"
OUT=$(cd "$ROOT/contracts" && forge test 2>&1 || true)
echo "$OUT" | grep -E "FAIL|Ran [0-9]+ test suites" || true
echo "$OUT" | grep -qE "Ran [0-9]+ test suites.* 0 failed" || { echo "contract tests failed"; exit 1; }

step "2/5 web type-check + lint"
(cd "$ROOT/web" && npx tsc --noEmit 2>&1 | grep -v "\.next/types" | grep . && exit 1 || true)
(cd "$ROOT/web" && npx eslint src --max-warnings 0 && echo "clean")

step "3/5 fresh fork + deploy"
pkill -x anvil || true; sleep 1
(setsid nohup anvil --fork-url https://sepolia.base.org --chain-id 31337 --port 8545 --silent > /tmp/mohur-anvil.log 2>&1 &)
for i in $(seq 1 40); do cast block-number --rpc-url $R >/dev/null 2>&1 && break; sleep 1; done
K0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # anvil's public dev keys
K1=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
K2=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
cd "$ROOT/contracts"
for s in "DeployMohur:$K0" "LaunchIndex:$K1" "DemoTrades:$K2"; do
  n=${s%%:*}; k=${s##*:}
  LOG=$(forge script "script/$n.s.sol" --rpc-url $R --broadcast --private-key "$k" --slow 2>&1 || true)
  echo "$LOG" | grep -q "COMPLETE & SUCCESSFUL" && echo "  $n ok" || { echo "  $n FAILED"; echo "$LOG" | tail -5; exit 1; }
done
(cd "$ROOT/web" && npm run sync >/dev/null)

step "4/5 on-chain smoke test"
SMOKE=$("$ROOT/scripts/smoke.sh" local 2>&1) && RC=0 || RC=$?
echo "$SMOKE" | grep -E "FAIL|passed"
[ $RC -eq 0 ] || exit 1

step "5/5 user flows"
E2E=$(cd "$ROOT/web" && node --no-warnings scripts/e2e-flows.mjs 2>&1) && RC=0 || RC=$?
echo "$E2E" | grep -E "FAIL|passed"
[ $RC -eq 0 ] || exit 1
echo; echo "ALL CHECKS PASSED"

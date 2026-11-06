#!/usr/bin/env bash
# Fresh local fork of Base Sepolia on :8545 with Unison deployed, a 40/30/30 demo index launched, demo fills on
# both venues, and the web app's ABIs/addresses synced. Used by check-all.sh and the Playwright suite.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.foundry/bin:$PATH"
R=http://127.0.0.1:8545
pkill -x anvil || true; sleep 1
# anvil fetches Base Sepolia state lazily during the run: use a sturdier upstream and retry flaky requests
# (sepolia.base.org dropped requests mid-run in testing: "Fork Error ... error sending request")
FORK_URL="${FORK_URL:-https://base-sepolia-rpc.publicnode.com}"
(setsid nohup anvil --fork-url "$FORK_URL" --chain-id 31337 --port 8545 --retries 12 --fork-retry-backoff 800 --silent > /tmp/unison-anvil.log 2>&1 &)
for i in $(seq 1 60); do cast block-number --rpc-url $R >/dev/null 2>&1 && break; sleep 1; done
cast block-number --rpc-url $R >/dev/null || { echo "anvil did not start"; exit 1; }
# anvil's well-known public dev keys (local fork only)
K0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
K1=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
K2=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
cd "$ROOT/contracts"
[ -d lib/v4-periphery/lib/v4-core/out ] || npm run build:v4 >/dev/null
for s in "DeployUnison:$K0" "LaunchIndex:$K1" "DemoTrades:$K2"; do
  n=${s%%:*}; k=${s##*:}
  LOG=$(forge script "script/$n.s.sol" --rpc-url $R --broadcast --private-key "$k" --slow 2>&1 || true)
  echo "$LOG" | grep -q "COMPLETE & SUCCESSFUL" && echo "  $n ok" || { echo "  $n FAILED"; echo "$LOG" | tail -8; exit 1; }
done
(cd "$ROOT/web" && npm run sync >/dev/null)
echo "fork ready: $R"

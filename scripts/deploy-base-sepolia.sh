#!/usr/bin/env bash
# One-command Base Sepolia deploy: shared contracts, a 40/30/30 demo index, demo fills, sync to the web app.
# Prereq: a funded deployer in Foundry's keystore (~0.02 test ETH):  cast wallet import mohur-deployer --interactive
set -euo pipefail
ACCOUNT="${ACCOUNT:-mohur-deployer}"
RPC="${RPC:-https://sepolia.base.org}"
cd "$(dirname "$0")/../contracts"
SENDER=$(cast wallet address --account "$ACCOUNT")
echo "deployer/maker/trader: $SENDER on $RPC"
for s in DeployMohur LaunchIndex DemoTrades; do
  forge script "script/$s.s.sol" --rpc-url "$RPC" --account "$ACCOUNT" --sender "$SENDER" --broadcast --slow
done
cd ../web && npm run sync
echo "done: contracts/deployments/base-sepolia.json"

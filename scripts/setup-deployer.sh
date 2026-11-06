#!/usr/bin/env bash
# One-time: create a fresh, testnet-only deployer wallet for Mohur, stored encrypted by Foundry.
# You type the password (hidden); the private key is never printed and never leaves ~/.foundry/keystores.
#   ./scripts/setup-deployer.sh      then fund the printed address, then ./scripts/deploy-base-sepolia.sh
# Already have a testnet key you'd rather use?  cast wallet import mohur-deployer --interactive
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"
ACCOUNT="${ACCOUNT:-mohur-deployer}"
command -v cast >/dev/null || { echo "Foundry not found: curl -L https://foundry.paradigm.xyz | bash && foundryup"; exit 1; }
if cast wallet list 2>/dev/null | grep -q "^$ACCOUNT"; then
  echo "Keystore '$ACCOUNT' already exists."
else
  echo "Creating '$ACCOUNT'. Choose a password (hidden):"
  mkdir -p "$HOME/.foundry/keystores"
  cast wallet new "$HOME/.foundry/keystores" "$ACCOUNT" --password >/dev/null
fi
echo "Enter the password once more to show the address:"
ADDR=$(cast wallet address --account "$ACCOUNT")
cat <<MSG

  Deployer address:  $ADDR

  Fund it with at least 0.005 Base Sepolia ETH (the whole deploy uses about 0.0002 ETH):
    https://portal.cdp.coinbase.com/products/faucet
    https://www.alchemy.com/faucets/base-sepolia
    https://faucet.quicknode.com/base/sepolia

  Then run:  ./scripts/deploy-base-sepolia.sh
MSG

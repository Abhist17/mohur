#!/usr/bin/env bash
# Everything, end to end, on a fresh local fork of Base Sepolia:
#   1. contract tests (incl. invariants, audit PoC, live fork tests)   2. web type-check + lint
#   3. fresh anvil fork -> deploy, launch demo index, demo fills       4. 36 on-chain smoke checks
#   5. headless user flows (Launch, Swap both venues, Arbitrage, re-weight, pause/resume, friendly errors)
#   6. browser suite: every screen in real Chrome on another fresh fork (Playwright, 14 specs)
# Usage: ./scripts/check-all.sh        (restarts the anvil on :8545; NO_BROWSER=1 skips step 6)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.foundry/bin:$PATH"
R=http://127.0.0.1:8545
step() { printf "\n\033[1;33m== %s\033[0m\n" "$*"; }

step "1/6 contract tests"
OUT=$(cd "$ROOT/contracts" && forge test 2>&1 || true)
echo "$OUT" | grep -E "FAIL|Ran [0-9]+ test suites" || true
echo "$OUT" | grep -qE "Ran [0-9]+ test suites.* 0 failed" || { echo "contract tests failed"; exit 1; }

step "2/6 web type-check + lint"
(cd "$ROOT/web" && npx tsc --noEmit 2>&1 | grep -v "\.next/types" | grep . && exit 1 || true)
(cd "$ROOT/web" && npx eslint src --max-warnings 0 && echo "clean")

step "3/6 fresh fork + deploy"
"$ROOT/scripts/fork-up.sh"

step "4/6 on-chain smoke test"
SMOKE=$("$ROOT/scripts/smoke.sh" local 2>&1) && RC=0 || RC=$?
echo "$SMOKE" | grep -E "FAIL|passed"
[ $RC -eq 0 ] || exit 1

step "5/6 user flows"
E2E=$(cd "$ROOT/web" && node --no-warnings scripts/e2e-flows.mjs 2>&1) && RC=0 || RC=$?
echo "$E2E" | grep -E "FAIL|passed"
[ $RC -eq 0 ] || exit 1
if [ -z "${NO_BROWSER:-}" ]; then
  step "6/6 browser suite (fresh fork)"
  PW=$(cd "$ROOT/web" && npx playwright test -c e2e/playwright.config.ts 2>&1) && RC=0 || RC=$?
  echo "$PW" | grep -E "✘|passed|failed"
  [ $RC -eq 0 ] || exit 1
fi
echo; echo "ALL CHECKS PASSED"

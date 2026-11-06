#!/usr/bin/env python3
"""80-digit reference for UnisonMath (weighted-pool curve over real balances).

Generates contracts/reference/vectors.json, consumed by test/UnisonMath.t.sol.
All numbers are 18-decimal fixed point integers (scaled), like the Solidity library.
"""
import json
import os
import random
from decimal import Decimal, getcontext

getcontext().prec = 80
ONE = Decimal(10) ** 18


def out_given_in(bi, wi, bo, wo, a, fee):
    bi, wi, bo, wo, a, fee = (Decimal(x) for x in (bi, wi, bo, wo, a, fee))
    a_net = a * (ONE - fee) / ONE
    base = bi / (bi + a_net)
    return bo * (1 - (base.ln() * (wi / wo)).exp())


def in_given_out(bi, wi, bo, wo, a, fee):
    bi, wi, bo, wo, a, fee = (Decimal(x) for x in (bi, wi, bo, wo, a, fee))
    base = bo / (bo - a)
    net = bi * ((base.ln() * (wo / wi)).exp() - 1)
    return net / ((ONE - fee) / ONE)


def spot(bi, wi, bj, wj):
    bi, wi, bj, wj = (Decimal(x) for x in (bi, wi, bj, wj))
    return (wi / wj) * (bj / bi) * ONE


def main():
    rng = random.Random(0x4D4F485552)  # fixed seed: the reference vectors in UnisonMath.t.sol depend on it
    weights = [
        (0.4e18, 0.3e18), (0.3e18, 0.4e18), (0.3e18, 0.3e18), (0.5e18, 0.25e18),
        (0.25e18, 0.5e18), (0.8e18, 0.1e18), (0.1e18, 0.8e18), (0.02e18, 0.49e18),
    ]
    fees = [0, int(0.003e18), int(0.01e18)]
    ratios = [0.000001, 0.001, 0.05, 0.1, 0.2, 0.29, 0.3]
    vec = {k: [] for k in ("bi", "wi", "bo", "wo", "a", "fee", "out", "inn")}
    for wi, wo in weights:
        for fee in fees:
            for r in ratios:
                bi = rng.randint(10**18, 10**27)
                bo = rng.randint(10**18, 10**27)
                wi_, wo_ = int(wi), int(wo)
                # exact-in amount (r of bi) and exact-out amount (r/2 of bo), clamped by 30% out
                a = int(Decimal(bi) * Decimal(r)) or 1
                out = out_given_in(bi, wi_, bo, wo_, a, fee)
                if out > Decimal(bo) * Decimal("0.3"):
                    continue
                aout = int(Decimal(bo) * Decimal(r) / 2) or 1
                inn = in_given_out(bi, wi_, bo, wo_, aout, fee)
                if inn > Decimal(bi) * Decimal("0.3"):
                    continue
                for k, v in (("bi", bi), ("wi", wi_), ("bo", bo), ("wo", wo_), ("a", a), ("fee", fee)):
                    vec[k].append(str(v))
                vec["out"].append(str(int(out)))          # floor of exact
                vec["inn"].append(str(int(inn) + 1))      # ceil of exact (strict upper)
                # exact-out amount is stored alongside so the test can recompute
                vec.setdefault("aout", []).append(str(aout))
    n = len(vec["bi"])
    path = os.path.join(os.path.dirname(__file__), "vectors.json")
    with open(path, "w") as f:
        json.dump({"n": n, **vec}, f, indent=1)
    print(f"wrote {n} vectors to {path}")


if __name__ == "__main__":
    main()

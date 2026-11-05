// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test, stdJson } from "forge-std/Test.sol";
import { MohurMath } from "../src/libraries/MohurMath.sol";

/// @dev External wrapper so library reverts can be caught and fuzzed.
contract MathHarness {
    function outGivenIn(uint256 bi, uint256 wi, uint256 bo, uint256 wo, uint256 a, uint256 f)
        external
        pure
        returns (uint256)
    {
        return MohurMath.outGivenIn(bi, wi, bo, wo, a, f);
    }

    function inGivenOut(uint256 bi, uint256 wi, uint256 bo, uint256 wo, uint256 a, uint256 f)
        external
        pure
        returns (uint256)
    {
        return MohurMath.inGivenOut(bi, wi, bo, wo, a, f);
    }

    function spot(uint256 bi, uint256 wi, uint256 bj, uint256 wj) external pure returns (uint256) {
        return MohurMath.spotPrice(bi, wi, bj, wj);
    }

    function validateWeights(uint256[] memory w) external pure {
        MohurMath.validateWeights(w);
    }
}

contract MohurMathTest is Test {
    using stdJson for string;

    MathHarness internal m;
    uint256 internal constant FEE = 0.003e18;
    /// @dev Accuracy budget vs. the 80-digit reference, relative to the balance moved.
    uint256 internal constant TOL = 3e4; // 3e-14 * 1e18

    function setUp() public {
        m = new MathHarness();
    }

    // ------------------------------------------------------------------
    // Accuracy against the Python reference (reference/vectors.json)
    // ------------------------------------------------------------------

    function test_vectors_matchReference_makerSide() public view {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/reference/vectors.json"));
        uint256 n = json.readUint(".n");
        assertGt(n, 100, "too few vectors");
        uint256[] memory bi = _arr(json, ".bi");
        uint256[] memory wi = _arr(json, ".wi");
        uint256[] memory bo = _arr(json, ".bo");
        uint256[] memory wo = _arr(json, ".wo");
        uint256[] memory a = _arr(json, ".a");
        uint256[] memory fee = _arr(json, ".fee");
        uint256[] memory out = _arr(json, ".out");
        uint256[] memory inn = _arr(json, ".inn");
        uint256[] memory aout = _arr(json, ".aout");

        for (uint256 k; k < n; ++k) {
            uint256 got = m.outGivenIn(bi[k], wi[k], bo[k], wo[k], a[k], fee[k]);
            // never more than the exact answer (maker side) ...
            assertLe(got, out[k], "outGivenIn above exact");
            // ... and within 3e-14 of the balance
            assertLe(out[k] - got, bo[k] * TOL / 1e18 + 1, "outGivenIn inaccurate");

            uint256 gotIn = m.inGivenOut(bi[k], wi[k], bo[k], wo[k], aout[k], fee[k]);
            assertGe(gotIn, inn[k], "inGivenOut below exact");
            assertLe(gotIn - inn[k], bi[k] * TOL / 1e18 + 1, "inGivenOut inaccurate");
        }
    }

    // ------------------------------------------------------------------
    // Spot price
    // ------------------------------------------------------------------

    function test_spot_balancedIndexIsOraclePrice() public view {
        // 40/30/30 index worth $100k at ETH=$4000, BTC=$100000, USDC=$1
        uint256 eth = 10e18; // $40k
        uint256 usdc = 30_000e18; // $30k
        uint256 p = m.spot(eth, 0.4e18, usdc, 0.3e18);
        assertApproxEqRel(p, 4000e18, 1e6, "ETH price in USDC");
    }

    // ------------------------------------------------------------------
    // Loops lose
    // ------------------------------------------------------------------

    function testFuzz_roundTrip_losesAtLeastProvenFloor(
        uint256 bi,
        uint256 bo,
        uint256 wiSeed,
        uint256 woSeed,
        uint256 a
    ) public view {
        bi = bound(bi, 1e18, 1e30);
        bo = bound(bo, 1e18, 1e30);
        uint256 wi = bound(wiSeed, 0.02e18, 0.8e18);
        uint256 wo = bound(woSeed, 0.02e18, 0.8e18);
        a = bound(a, bi / 1e6 + 1, bi * 29 / 100);

        uint256 out;
        try m.outGivenIn(bi, wi, bo, wo, a, FEE) returns (uint256 o) {
            out = o;
        } catch {
            return; // exceeds 30% out
        }
        vm.assume(out > 0);
        uint256 back;
        try m.outGivenIn(bo - out, wo, bi + a, wi, out, FEE) returns (uint256 b) {
            back = b;
        } catch {
            return;
        }
        assertLt(back, a, "round trip must lose");
        // proven floor: a*f*B / (B + a(1-f)), minus a tiny allowance for 18-dec truncation
        uint256 floorLoss = a * FEE / 1e18 * bi / (bi + a * (1e18 - FEE) / 1e18);
        assertGe(a - back + 1e6, floorLoss, "loss below proven floor");
    }

    function testFuzz_feeFreeInvariantNeverDecreases(uint256 bi, uint256 bo, uint256 a) public view {
        bi = bound(bi, 1e18, 1e30);
        bo = bound(bo, 1e18, 1e30);
        a = bound(a, 1e6, bi * 29 / 100);
        uint256 out;
        try m.outGivenIn(bi, 0.4e18, bo, 0.3e18, a, 0) returns (uint256 o) {
            out = o;
        } catch {
            return;
        }
        // invariant V = B_i^0.4 * B_o^0.3 must not drop (rounding favours the maker)
        uint256 before = _inv(bi, bo);
        uint256 afterV = _inv(bi + a, bo - out);
        assertGe(afterV + afterV / 1e13, before, "invariant decreased");
    }

    function testFuzz_donationThenSwapNeverProfits(uint256 bi, uint256 bo, uint256 donation, uint256 a) public view {
        // An attacker who donates tokens to the wallet and then trades back can only lose.
        bi = bound(bi, 1e18, 1e28);
        bo = bound(bo, 1e18, 1e28);
        donation = bound(donation, 1, bo);
        a = bound(a, 1e6, bi * 29 / 100);
        // donate `donation` of token o, then sell i for o
        uint256 out;
        try m.outGivenIn(bi, 0.4e18, bo + donation, 0.3e18, a, FEE) returns (uint256 o) {
            out = o;
        } catch {
            return;
        }
        // value out (in o) can never exceed donation + what a fair trade at the pre-donation curve pays
        uint256 fair;
        try m.outGivenIn(bi, 0.4e18, bo, 0.3e18, a, FEE) returns (uint256 o) {
            fair = o;
        } catch {
            return;
        }
        assertLe(out, fair + donation, "donation was profitable");
    }

    // ------------------------------------------------------------------
    // Guards
    // ------------------------------------------------------------------

    function test_revert_overMaxIn() public {
        vm.expectRevert(MohurMath.MaxInRatio.selector);
        m.outGivenIn(100e18, 0.5e18, 100e18, 0.5e18, 31e18, FEE);
    }

    function test_revert_overMaxOut() public {
        vm.expectRevert(MohurMath.MaxOutRatio.selector);
        m.inGivenOut(100e18, 0.5e18, 100e18, 0.5e18, 31e18, FEE);
    }

    function test_revert_badWeights() public {
        uint256[] memory w = new uint256[](3);
        w[0] = 0.4e18;
        w[1] = 0.3e18;
        w[2] = 0.29e18;
        vm.expectRevert(MohurMath.BadWeights.selector);
        m.validateWeights(w);
        w[2] = 0.3e18;
        m.validateWeights(w);
    }

    function test_exactInExactOut_consistent() public view {
        uint256 out = m.outGivenIn(50e18, 0.4e18, 120_000e18, 0.3e18, 1e18, FEE);
        uint256 inn = m.inGivenOut(50e18, 0.4e18, 120_000e18, 0.3e18, out, FEE);
        // exact-in and exact-out agree to within the 1e-12 rounding budget (both round toward the maker)
        assertApproxEqRel(inn, 1e18, 1e6);
    }

    // ------------------------------------------------------------------

    function _inv(uint256 x, uint256 y) internal pure returns (uint256) {
        return MohurMath.mulDown(MohurMath.powDown(x, 0.4e18), MohurMath.powDown(y, 0.3e18));
    }

    function _arr(string memory json, string memory key) internal pure returns (uint256[] memory out) {
        string[] memory s = json.readStringArray(key);
        out = new uint256[](s.length);
        for (uint256 i; i < s.length; ++i) {
            out[i] = vm.parseUint(s[i]);
        }
    }
}

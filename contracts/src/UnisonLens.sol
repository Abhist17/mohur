// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { IAqua } from "@1inch/aqua/contracts/interfaces/IAqua.sol";
import { ISwapVM } from "@1inch/swap-vm/contracts/interfaces/ISwapVM.sol";

import { UnisonHook } from "./UnisonHook.sol";
import { UnisonMath } from "./libraries/UnisonMath.sol";
import { UnisonStrategy } from "./aqua/UnisonStrategy.sol";

/// @title UnisonLens
/// @notice Read helper for the dashboard: the exact strategy bytes to ship, the whole book in one call,
///         quotes from both venues, and exact multi-leg route quotes. Stateless; one deployment serves all makers.
contract UnisonLens {
    struct TokenView {
        address token;
        string symbol;
        uint8 decimals;
        uint256 weight;
        uint256 walletBalance;
        uint256 pending; // Uniswap input held as claims
        uint256 effectiveBalance;
        uint256 v4Limit; // what the Uniswap venue may still sell
        uint256 aquaLimit; // what the 1inch venue may still sell (sum over this token's pair strategies)
    }

    struct PairView {
        address tokenA;
        address tokenB;
        bytes32 aquaStrategyHash;
        uint256 aquaLimitA;
        uint256 aquaLimitB;
        uint256 priceAinB; // 18 dec, fee excluded
    }

    struct Book {
        address maker;
        address hook;
        uint256 fee;
        bytes32 v4StrategyHash;
        TokenView[] tokens;
        PairView[] pairs;
    }

    // ------------------------------------------------------------------------------------------
    // Strategy bytes (what the Launch screen ships)
    // ------------------------------------------------------------------------------------------

    function v4Strategy(UnisonHook hook, uint256 nonce) external view returns (bytes memory) {
        return hook.strategy(nonce);
    }

    function aquaOrder(UnisonHook hook, address tokenA, address tokenB, uint64 salt)
        public
        view
        returns (ISwapVM.Order memory order, bytes memory strategy, bytes32 strategyHash)
    {
        order = UnisonStrategy.order(hook.maker(), address(hook), tokenA, tokenB, salt);
        strategy = UnisonStrategy.strategyBytes(order);
        strategyHash = keccak256(strategy);
    }

    /// @notice The pair's order for the hook's current epoch (venueNonce doubles as the Aqua order salt, so
    ///         re-shipping after a pause or top-up only needs setVenueNonce(n + 1)).
    function activeAquaOrder(UnisonHook hook, address tokenA, address tokenB)
        public
        view
        returns (ISwapVM.Order memory order, bytes memory strategy, bytes32 strategyHash)
    {
        return aquaOrder(hook, tokenA, tokenB, uint64(hook.venueNonce()));
    }

    // ------------------------------------------------------------------------------------------
    // The book
    // ------------------------------------------------------------------------------------------

    function book(UnisonHook hook, address swapVM) external view returns (Book memory b) {
        IAqua aqua = hook.aqua();
        address maker = hook.maker();
        address[] memory ts = hook.tokens();
        uint256 n = ts.length;
        b.maker = maker;
        b.hook = address(hook);
        b.fee = hook.fee();
        b.v4StrategyHash = hook.strategyHash();
        b.tokens = new TokenView[](n);
        b.pairs = new PairView[](n * (n - 1) / 2);

        for (uint256 i; i < n; ++i) {
            TokenView memory t = b.tokens[i];
            t.token = ts[i];
            t.symbol = IERC20Metadata(ts[i]).symbol();
            t.decimals = IERC20Metadata(ts[i]).decimals();
            t.weight = hook.weightOf(ts[i]);
            t.walletBalance = IERC20Metadata(ts[i]).balanceOf(maker);
            t.pending = hook.pending(ts[i]);
            t.effectiveBalance = t.walletBalance + t.pending;
            t.v4Limit = hook.venueLimit(ts[i]);
        }
        uint256 k;
        for (uint256 i; i < n; ++i) {
            for (uint256 j = i + 1; j < n; ++j) {
                PairView memory p = b.pairs[k++];
                (address t0, address t1) = ts[i] < ts[j] ? (ts[i], ts[j]) : (ts[j], ts[i]);
                p.tokenA = t0;
                p.tokenB = t1;
                (,, p.aquaStrategyHash) = activeAquaOrder(hook, t0, t1);
                (uint256 la, uint8 ca) = aqua.rawBalances(maker, swapVM, p.aquaStrategyHash, t0);
                (uint256 lb, uint8 cb) = aqua.rawBalances(maker, swapVM, p.aquaStrategyHash, t1);
                if (ca != 0 && ca != type(uint8).max) p.aquaLimitA = la;
                if (cb != 0 && cb != type(uint8).max) p.aquaLimitB = lb;
                p.priceAinB = _try(hook, t0, t1);
                b.tokens[t0 == ts[i] ? i : j].aquaLimit += p.aquaLimitA;
                b.tokens[t0 == ts[i] ? j : i].aquaLimit += p.aquaLimitB;
            }
        }
    }

    function _try(UnisonHook hook, address a, address b) internal view returns (uint256 p) {
        try hook.price(a, b) returns (uint256 v) {
            p = v;
        } catch { }
    }

    // ------------------------------------------------------------------------------------------
    // Previews: the contracts' own math on hypothetical balances (18-dec scaled), for the Create screen
    // ------------------------------------------------------------------------------------------

    function previewSpot(uint256 balanceI, uint256 weightI, uint256 balanceJ, uint256 weightJ)
        external
        pure
        returns (uint256)
    {
        return UnisonMath.spotPrice(balanceI, weightI, balanceJ, weightJ);
    }

    function previewOutGivenIn(
        uint256 balanceIn,
        uint256 weightIn,
        uint256 balanceOut,
        uint256 weightOut,
        uint256 amountIn,
        uint256 fee
    ) external pure returns (uint256) {
        return UnisonMath.outGivenIn(balanceIn, weightIn, balanceOut, weightOut, amountIn, fee);
    }

    // ------------------------------------------------------------------------------------------
    // Quotes
    // ------------------------------------------------------------------------------------------

    /// @notice Quote the same trade on both venues in one eth_call. ok=false if that venue would refuse
    ///         (e.g. venue limit or 30% trade bound). Not `view` because SwapVM.quote is not.
    function quoteBoth(UnisonHook hook, ISwapVM swapVM, address tokenIn, address tokenOut, uint256 amount, bool exactIn)
        external
        returns (uint256 v4In, uint256 v4Out, bool v4Ok, uint256 aquaIn, uint256 aquaOut, bool aquaOk)
    {
        try hook.quote(tokenIn, tokenOut, amount, exactIn) returns (uint256 i, uint256 o) {
            (v4In, v4Out) = (i, o);
            v4Ok = o <= hook.venueLimit(tokenOut);
        } catch { }
        (ISwapVM.Order memory order,,) = activeAquaOrder(hook, tokenIn, tokenOut);
        try swapVM.quote(order, amount, _takerData(tokenIn, tokenOut, exactIn)) returns (uint256 i, uint256 o, bytes32) {
            (aquaIn, aquaOut, aquaOk) = (i, o, true);
        } catch { }
    }

    /// @notice Exact quote of a multi-leg exact-in route through the maker wallet. Because both venues price
    ///         from the same balances with the same formula, the venue choice only matters for the venue
    ///         limit, which is checked per leg. venues[k]: 0 = Uniswap v4, 1 = 1inch Aqua.
    struct RouteCtx {
        UnisonHook hook;
        address swapVM;
        uint256 fee;
        uint256[] bal; // running balances per path position (shared by repeated tokens)
    }

    function quoteRoute(UnisonHook hook, address swapVM, address[] calldata path, uint8[] calldata venues, uint256 amountIn)
        external
        view
        returns (uint256[] memory amounts, bool withinLimits)
    {
        require(path.length == venues.length + 1 && venues.length > 0, "route");
        RouteCtx memory r = RouteCtx(hook, swapVM, hook.fee(), new uint256[](path.length));
        for (uint256 k; k < path.length; ++k) {
            r.bal[k] = hook.effectiveBalance(path[k]);
        }
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        withinLimits = true;
        for (uint256 k; k < venues.length; ++k) {
            bool ok;
            (amounts[k + 1], ok) = _leg(r, path, k, venues[k], amounts[k]);
            if (!ok) withinLimits = false;
        }
    }

    function _leg(RouteCtx memory r, address[] calldata path, uint256 k, uint8 venue, uint256 amountIn)
        internal
        view
        returns (uint256 out, bool ok)
    {
        address tIn = path[k];
        address tOut = path[k + 1];
        uint256 bIn = _bal(path, r.bal, tIn);
        uint256 bOut = _bal(path, r.bal, tOut);
        out = _out(r.hook, tIn, tOut, bIn, bOut, amountIn, r.fee);
        _setBal(path, r.bal, tIn, bIn + amountIn);
        _setBal(path, r.bal, tOut, bOut - out);
        ok = _withinLimit(r.hook, r.swapVM, venue, tIn, tOut, out);
    }

    function _out(UnisonHook hook, address tIn, address tOut, uint256 bIn, uint256 bOut, uint256 a, uint256 fee)
        internal
        view
        returns (uint256)
    {
        (,,, uint256 sIn) = hook.tokenInfo(tIn);
        (,,, uint256 sOut) = hook.tokenInfo(tOut);
        uint256 o = UnisonMath.outGivenIn(bIn * sIn, hook.weightOf(tIn), bOut * sOut, hook.weightOf(tOut), a * sIn, fee);
        return UnisonMath.fromScaledDown(o, sOut);
    }

    function _withinLimit(UnisonHook hook, address swapVM, uint8 venue, address tIn, address tOut, uint256 out)
        internal
        view
        returns (bool)
    {
        if (venue == 0) return out <= hook.venueLimit(tOut);
        (,, bytes32 h) = activeAquaOrder(hook, tIn, tOut);
        (uint256 lim,) = hook.aqua().rawBalances(hook.maker(), swapVM, h, tOut);
        return out <= lim;
    }

    function _bal(address[] calldata path, uint256[] memory bal, address t) internal pure returns (uint256) {
        for (uint256 k; k < path.length; ++k) {
            if (path[k] == t) return bal[k];
        }
        revert("token");
    }

    function _setBal(address[] calldata path, uint256[] memory bal, address t, uint256 v) internal pure {
        for (uint256 k; k < path.length; ++k) {
            if (path[k] == t) bal[k] = v;
        }
    }

    function _takerData(address tokenIn, address tokenOut, bool exactIn) internal view returns (bytes memory) {
        return UnisonStrategy.takerData(address(this), tokenIn, tokenOut, exactIn);
    }
}

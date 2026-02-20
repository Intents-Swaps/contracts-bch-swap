# Dutch Auction on BCH: Recursive Covenants & Introspection Opcodes

## The Challenge

Dutch Auctions require **continuous state tracking** (price vs time). Unlike Ethereum, Bitcoin Cash has no mutable storage — so how do you track a decaying price curve on a UTXO chain?

## Our Solution

We use two core BCH primitives: **Recursive Covenants** (to encode and pass state) and **Introspection Opcodes** (to verify output conditions at spend-time).

---

## 1. Recursive Covenants — State Without Storage

The auction state is encoded directly in the **contract's constructor parameters**, which are baked into its **P2SH address**:

```cashscript
// contracts/DutchAuctionSwap.cash (Lines 14-31)
contract DutchAuctionSwap(
    bytes20 makerPkh,          // WHO created the order
    bytes   sellTokenCategory, // WHAT they're selling
    bytes   buyTokenCategory,  // WHAT they want
    int     sellAmount,        // HOW MUCH
    int     startBuyAmount,    // Starting price (HIGH)
    int     endBuyAmount,      // Ending price (LOW)
    int     startTime,         // WHEN auction starts
    int     duration           // HOW LONG it runs
)
```

**Each unique set of parameters generates a unique contract address.** The address itself IS a commitment to the auction state. No mutable storage needed — the state is the covenant.

### Why "Recursive"?

The covenant enforces spending conditions that **reference its own state**. The contract's constructor params define the price curve, and the `fill()` function recomputes the price from those same params at execution time. The state is "passed forward" through the deterministic relationship between constructor args → address → spending script.

---

## 2. Introspection Opcodes — On-Chain Verification

CashScript compiles to BCH's native **introspection opcodes** (`OP_TXLOCKTIME`, `OP_OUTPUTBYTECODE`, `OP_OUTPUTTOKENAMOUNT`, etc.). These let the covenant **inspect the spending transaction** to enforce rules:

### a) Time-Based Price Calculation

```cashscript
// DutchAuctionSwap.cash (Lines 46-58)
int currentTime = tx.locktime;  // OP_TXLOCKTIME — reads tx nLockTime
require(currentTime >= startTime);

// Linear decay: price drops from startBuyAmount → endBuyAmount over duration
int elapsed = currentTime - startTime;
int clampedElapsed = min(elapsed, duration);
int priceDrop = startBuyAmount - endBuyAmount;
int dropAmount = (priceDrop * clampedElapsed) / duration;
int currentPrice = startBuyAmount - dropAmount;
```

`tx.locktime` is the key introspection opcode here — it lets the contract read the **transaction's locktime field** as a proxy for "current time", enabling the Dutch Auction price curve to decay on-chain.

### b) Output Verification (Covenant Enforcement)

```cashscript
// DutchAuctionSwap.cash (Lines 63-90)

// Output 0: Verify maker receives >= currentPrice of buy tokens
require(tx.outputs[0].lockingBytecode == makerLockingBytecode);  // OP_OUTPUTBYTECODE
require(tx.outputs[0].tokenCategory == buyTokenCategory);        // OP_OUTPUTTOKENCATEGORY
require(tx.outputs[0].tokenAmount >= currentPrice);              // OP_OUTPUTTOKENAMOUNT

// Output 1: Verify resolver receives sell tokens
require(tx.outputs[1].lockingBytecode == resolverLockingBytecode);
require(tx.outputs[1].tokenCategory == sellTokenCategory);
require(tx.outputs[1].tokenAmount >= sellAmount);
```

These introspection opcodes let the covenant verify:
- **WHO** gets paid (locking bytecode check)
- **WHAT** token they receive (category check)
- **HOW MUCH** they receive (amount check)

All enforced at the **Bitcoin Script level** — no trusted third party.

---

## 3. Deployment — Little-Endian Awareness

```typescript
// tools/deploy_long_auction.ts (Lines 135-149)
const reverseHex = (hex: string) => hex.match(/.{2}/g)!.reverse().join('');

const contract = new Contract(artifact, [
    makerPkh,
    `0x${reverseHex(categoryId)}`,  // Reverse to Little-Endian for introspection
    buyTokenCategory,
    sellAmount, startBuyAmount, endBuyAmount,
    startTime, duration
], { provider });
```

We reverse the token category ID to **Little-Endian** because BCH introspection opcodes return data in wire format. This ensures `tx.outputs[].tokenCategory` matches correctly during covenant verification.

---

## 4. Test Validation

Our test suite ([DutchAuctionSwap.test.ts](test/DutchAuctionSwap.test.ts)) validates:

| Test | What It Proves |
|------|---------------|
| **Compilation & Instantiation** | Contract compiles and deploys to Chipnet |
| **Dutch Auction Math** | Price decays correctly at 0%, 25%, 50%, 75%, 100% elapsed |
| **Address Determinism** | Same params → same address (covenant state commitment) |
| **Full Swap Lifecycle** | End-to-end: fund → fill → settle |

---

## Summary

| Technique | Where | Purpose |
|-----------|-------|---------|
| **Recursive Covenant** | Constructor params (L14-31) | Encode auction state in contract address |
| `tx.locktime` | Price calc (L46) | Read "current time" for Dutch Auction curve |
| `tx.outputs[].lockingBytecode` | Output check (L64, L81) | Verify WHO gets paid |
| `tx.outputs[].tokenCategory` | Output check (L72, L88) | Verify WHAT token is paid |
| `tx.outputs[].tokenAmount` | Output check (L73, L89) | Verify HOW MUCH is paid |
| `tx.outputs[].value` | Output check (L69, L75, L85) | Verify BCH amounts |
| `tx.time` | Cancel guard (L103) | Enforce timelock for cancellation |
| Little-Endian reversal | Deployment (L135) | Match introspection wire format |

> **TL;DR:** The covenant IS the state. Constructor params define the price curve, `tx.locktime` provides the clock, and output introspection enforces correctness. No oracles, no storage, no trust — just Bitcoin Script.

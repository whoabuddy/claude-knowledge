# Clarity Code Patterns

Recurring patterns and solutions for Clarity smart contracts.

## Public Function Template

Standard structure for public functions with guards and error handling:

```clarity
(define-public (transfer (amount uint) (to principal))
  (begin
    (asserts! (is-eq tx-sender owner) ERR_UNAUTHORIZED)
    (try! (ft-transfer? TOKEN amount tx-sender to))
    (ok true)))
```

- Use `try!` for subcalls to propagate errors
- Use `asserts!` for guards before state changes
- Add post-conditions on tx for asset safety

## Standardized Events

Emit structured events for off-chain indexing:

```clarity
(print {
  notification: "contract-event",
  payload: {
    amount: amount,
    sender: tx-sender,
    recipient: to
  }
})
```

- `notification`: string identifier for the event type
- `payload`: tuple with camelCase keys
- Examples: [usabtc-token](https://github.com/USA-BTC/smart-contracts/blob/main/contracts/usabtc-token.clar), [ccd002-treasury-v3](https://github.com/citycoins/protocol/blob/main/contracts/extensions/ccd002-treasury-v3.clar)

## Error Handling with Match

Handle external call failures gracefully:

```clarity
(match (contract-call? .other fn args)
  success (ok success)
  error (err ERR_EXTERNAL_CALL_FAILED))
```

## Bit Flags for Status/Permissions

Pack multiple booleans into a single uint:

```clarity
(define-constant STATUS_ACTIVE (pow u2 u0))   ;; 1
(define-constant STATUS_PAID (pow u2 u1))     ;; 2
(define-constant STATUS_VERIFIED (pow u2 u2)) ;; 4

;; Pack multiple flags: (+ STATUS_ACTIVE STATUS_PAID) → u3
;; Check flag: (> (bit-and status STATUS_ACTIVE) u0)
;; Set flag: (var-set status (bit-or (var-get status) NEW_FLAG))
;; Clear flag: (var-set status (bit-and (var-get status) (bit-not FLAG)))
```

Examples: [aibtc-action-proposal-voting](https://github.com/aibtcdev/aibtcdev-daos/blob/main/contracts/dao/extensions/aibtc-action-proposal-voting.clar)

## Multi-Send Pattern

Send to multiple recipients in one transaction using fold:

```clarity
(define-private (send-maybe
    (recipient {to: principal, ustx: uint})
    (prior (response bool uint)))
  (match prior
    ok-result (let (
      (to (get to recipient))
      (ustx (get ustx recipient)))
      (try! (stx-transfer? ustx tx-sender to))
      (ok true))
    err-result (err err-result)))

(define-public (send-many (recipients (list 200 {to: principal, ustx: uint})))
  (fold send-maybe recipients (ok true)))
```

## Parent-Child Maps (Hierarchical Data)

Store hierarchical data with pagination support:

```clarity
(define-map Parents uint {name: (string-ascii 32), lastChildId: uint})
(define-map Children {parentId: uint, id: uint} uint)

(define-read-only (get-child (parentId uint) (childId uint))
  (map-get? Children {parentId: parentId, id: childId}))

(define-private (is-some? (x (optional uint)))
  (is-some x))

(define-read-only (get-children (parentId uint) (shift uint))
  (filter is-some?
    (list
      (get-child parentId (+ shift u1))
      (get-child parentId (+ shift u2))
      (get-child parentId (+ shift u3))
      ;; ... up to page size
    )))
```

## Whitelisting (Assets/Contracts)

Control which contracts/assets can interact:

```clarity
(define-map Allowed {contract: principal, type: uint} bool)

;; Check in function
(asserts! (default-to false (map-get? Allowed {contract: contract, type: type}))
          ERR_NOT_ALLOWED)

;; Batch update
(define-public (set-allowed-list (items (list 100 {token: principal, enabled: bool})))
  (ok (map set-iter items (ok true))))
```

Examples: [ccd002-treasury-v3](https://github.com/citycoins/protocol/blob/main/contracts/extensions/ccd002-treasury-v3.clar), [aibtc-agent-account](https://github.com/aibtcdev/aibtcdev-daos/blob/main/contracts/agent/aibtc-agent-account.clar)

## Trait Whitelisting

Only allow calls from trusted trait implementations:

```clarity
(define-map TrustedTraits principal bool)

;; In functions accepting traits
(asserts! (default-to false (map-get? TrustedTraits (contract-of t)))
          ERR_UNTRUSTED)
```

## Delayed Activation

Activate functionality after a Bitcoin block delay:

```clarity
(define-constant DELAY u21000) ;; ~146 days in BTC blocks
(define-data-var activation-block uint u0)

;; Set on deploy or init
(var-set activation-block (+ burn-block-height DELAY))

(define-read-only (is-active?)
  (>= burn-block-height (var-get activation-block)))
```

Example: [usabtc-token](https://github.com/USA-BTC/smart-contracts/blob/main/contracts/usabtc-token.clar)

## Rate Limiting

Prevent rapid repeated actions:

```clarity
(define-data-var last-action-block uint u0)

(define-public (rate-limited-action)
  (begin
    (asserts! (> burn-block-height (var-get last-action-block)) ERR_RATE_LIMIT)
    (var-set last-action-block burn-block-height)
    ;; ... action
    (ok true)))
```

## DAO Proposals with Historic Balances

Use `at-block` for snapshot voting:

```clarity
(define-map Proposals uint {
  votesFor: uint,
  votesAgainst: uint,
  status: uint,
  liquidTokens: uint,
  blockHash: (buff 32)
})

;; Get voting power at proposal creation
(define-read-only (get-vote-power (proposal-id uint) (voter principal))
  (let ((proposal (unwrap! (map-get? Proposals proposal-id) u0)))
    (at-block (get blockHash proposal)
      (contract-call? .token get-balance voter))))

;; Quorum check: (>= (/ (* total-votes u100) liquid-supply) QUORUM_PERCENT)
```

Example: [aibtc-action-proposal-voting](https://github.com/aibtcdev/aibtcdev-daos/blob/main/contracts/dao/extensions/aibtc-action-proposal-voting.clar)

## Fixed-Point Arithmetic

Handle decimal values with scale factor:

```clarity
(define-constant SCALE (pow u10 u8)) ;; 8 decimal places

;; Multiply then divide to preserve precision
(define-read-only (calculate-share (amount uint) (percentage uint))
  (/ (* amount percentage) SCALE))

;; Convert to/from scaled values
(define-read-only (to-scaled (amount uint))
  (* amount SCALE))

(define-read-only (from-scaled (amount uint))
  (/ amount SCALE))
```

Example: [ccd012-redemption-nyc](https://github.com/citycoins/protocol/blob/main/contracts/extensions/ccd012-redemption-nyc.clar)

## Treasury Pattern with as-contract

Use `as-contract` for contract-controlled funds:

```clarity
(define-public (withdraw (amount uint) (recipient principal))
  (begin
    (asserts! (is-authorized tx-sender) ERR_UNAUTHORIZED)
    (as-contract (stx-transfer? amount (as-contract tx-sender) recipient))))
```

Warning: `as-contract` changes both `tx-sender` and `contract-caller` to the contract principal.

**tx-sender vs contract-caller decision framework:**
- `tx-sender`: Use for auth checks, identity attribution, self-action guards. Preserves human identity through normal proxies (user -> proxy -> target). Preferred for composability.
- `contract-caller`: Use when you need the IMMEDIATE caller identity specifically.
- Security note: Using `contract-caller` for self-action guards (e.g., "owner can't give themselves feedback") is bypassable -- owner routes through any proxy and `contract-caller` shows the proxy, not the owner. `tx-sender` catches this because it preserves the human origin.

| Call Path | contract-caller | tx-sender |
|-----------|-----------------|-----------|
| user -> target | user | user |
| user -> proxy -> target | proxy | user |
| user -> proxy (as-contract) -> target | proxy | proxy |

Examples: [ccd002-treasury-v3](https://github.com/citycoins/protocol/blob/main/contracts/extensions/ccd002-treasury-v3.clar), [aibtc-agent-account](https://github.com/aibtcdev/aibtcdev-daos/blob/main/contracts/agent/aibtc-agent-account.clar)

## Clarity 4: Asset Restrictions

Restrict what assets a contract call can move:

```clarity
(as-contract
  (with-stx u1000000)                              ;; Allow 1 STX
  (with-ft .token TOKEN u500)                      ;; Allow 500 fungible tokens
  (with-nft .nft-contract NFT (list u1 u2 u3))    ;; Allow specific NFT IDs
  ;; ... body
)

;; DANGER: Avoid unless necessary
(with-all-assets-unsafe)
```

## Multi-Party Coordination

Coordinate actions requiring multiple signatures:

```clarity
;; Proposal state
(define-map Intents uint {
  participants: (list 20 principal),
  accepts: uint,     ;; Bitmask of who accepted
  status: uint,      ;; 0=pending, 1=ready, 2=executed, 3=cancelled
  expiry: uint,
  payload: (buff 256)
})

;; Accept via signature verification
(define-public (accept (intent-id uint) (signature (buff 65)))
  (let (
    (intent (unwrap! (map-get? Intents intent-id) ERR_NOT_FOUND))
    (msg-hash (sha256 (concat (int-to-ascii intent-id) (get payload intent))))
    (signer (try! (secp256k1-recover? msg-hash signature))))
    ;; Verify signer is participant, update accepts bitmask
    (ok true)))
```

Reference: ERC-8001 pattern for decidable multi-party coordination.

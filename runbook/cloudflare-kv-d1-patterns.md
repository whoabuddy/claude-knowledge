
# Cloudflare KV / D1 patterns

Reach for the right storage primitive on Cloudflare Workers. Every example below traces back to a real merged PR in `aibtcdev/landing-page` — citations are at the end of each section.

## When to reach for each surface

| Surface | Reach for it when… | Avoid when… |
|---|---|---|
| **KV** | Small (≤25 MB), read-mostly, write-rare, eventual-consistency OK, key derivable from request, ≤1M writes/month, ≤10M reads/month on the paid plan. Ideal for typed read-mostly caches (token-price snapshot, negative-result memo). | You need atomic increment (no), per-key serialization (no), bounded TTL math at write time (no), or hot-path counter primitives. |
| **D1** | Structured + queryable + transactional + analyzable. ACID on a single DB. Read cost is **rows scanned**, not rows returned — fast queries are point-lookups on indexed columns, hot aggregates need maintained counter tables. | The query is unbounded (full table scan), hot-path COUNT(*) without an index, or you're paying per-row to maintain an aggregate you could maintain incrementally. |
| **`caches.default`** | Read-mostly + per-colo OK + computed from D1/API + 30s–24h TTL window + key derivable from request. The TTL is the cache eviction bound — write it explicitly via `Cache-Control: s-maxage=…`. | You need global consistency (per-colo means N colos = N caches), you need per-key locking, or you need to *delete* across colos atomically. |
| **Durable Object** | Globally serialized per key (single point of write), per-key consistency, WebSocket state, low-traffic per key (single CPU per object), durable transactions. | The work is stateless or read-mostly — DOs have non-trivial per-object cost and complexity overhead. Use a binding or caches.default first. |
| **`ratelimits` binding** | You need an atomic counter primitive over a fixed window {10s, 60s}. The **count itself doesn't matter** — only the predicate "exceeded?". Examples: per-key request limit, threshold trip, circuit-breaker counter. | You need to read the count back (binding doesn't expose it), you need a window outside {10s, 60s}, or you need a per-key state record (use D1 + binding). |

## Operating discipline (anti-patterns + how to verify)

### D1 analytics has a 60+ minute settle lag — read previous-previous-hour

`d1AnalyticsAdaptiveGroups` data for "the last hour" is partial — it can climb 30-50% as the data fills in. Reading T+18min after a merge will *consistently* show a sharp reduction that disappears once the hour settles.

**Verify cadence after a perf merge:**

1. Merge.
2. Wait until the next-after-next hour boundary closes (≥60min past the merge).
3. Read the previous-previous-hour bucket — most recent FULL settled hour.
4. Compare to a 7-day rolling pre-merge baseline.

**Anti-symptom**: declaring victory on a partial-hour read. Bit the May 2026 quest three separate times despite being documented after the first occurrence. Documented examples: `phases/P3B/retro.md`, `phases/P4/retro.md`, `phases/P5/baseline-after.md` § Honest D1 attribution.

### D1 hot-path `COUNT(*)` is pay-per-row-scanned

D1 bills on rows scanned, not rows returned. `SELECT COUNT(*) FROM swaps WHERE sender = ?` against a 2,500-row trade history walks every row on every request. Under an s-maxage=10 cache, that's ~9,000 row-scans/minute per hot agent.

**Replacement**: maintained counter table (see § Pattern: counter table for hot aggregates below).

Source: `feedback_d1_count_antipattern` (May 2026 incident: ~$33/day overage after KV→D1 migration in landing-page). Originally surfaced in `aibtcdev/landing-page#296`.

### D1 schema can be aspirational vs. live

Migration comments like `-- Replaces KV pattern X` describe intent, not what live code does. The migration runs; the read-flip may not have happened yet. **Grep `INSERT`/`UPDATE` before trusting D1 as source-of-truth.**

Source: `feedback_d1_schema_aspirational_vs_live`. Killer example from the May 2026 quest: `migrations/012_agent_inbox_stats.sql` was applied for weeks before the *read* side flipped — the counter table was being maintained on writes but nothing was reading from it.

### Use `after()` for additive D1 mirrors

Non-authoritative D1 co-writes (mirrors, secondary indexes, analytics tables) should run in `next/server` `after()` so they don't add response latency. The authoritative store (`KV.put` or the primary `D1.run`) stays on the response path; the mirror writes happen after.

Source: `feedback_after_pattern_for_additive_d1_mirrors`. **Exception**: when the mirror is *itself* the authoritative durable state (e.g., P2 `last_check_in_at` is the rate-limit truth post-quest), it must be synchronous — the response path consumes it.

### Emit + monitor the full event set, not just the happy-path trip event

A circuit breaker or rate-limiter ships at least three logical states: **tripped**, **suppressed-trip-due-to-degraded-store**, and **reset**. Each gets its own structured event. Test plans must include the full set in the post-merge monitoring checklist — operators reading worker-logs grep on event names, not on absence-of-success.

For lp#894's circuit breaker, that's five events:

| Event | What it signals | Severity |
|---|---|---|
| `circuit-breaker.opened` | Threshold tripped — protection active | warn (expected during incidents) |
| `circuit-breaker.check_failed` | `caches.default.match` threw — fail-open path | warn |
| `circuit-breaker.binding_missing` | `env.RATE_LIMIT_*` undefined — **config drift in production** | page |
| `circuit-breaker.record_failed` | Binding tripped + marker `cache.put` failed — **breaker silently bypassed per-colo** | page |
| `circuit-breaker.reset_failed` | Marker delete on success path failed — recovers on TTL anyway | warn |

The `record_failed` event is the load-bearing one to monitor: it's the only signal that the breaker's "should-be-open" state isn't being observed. Fail-open is the documented design, but operators need the metric to know it's happening — otherwise a config-drift or transient cache failure silently disables the protection.

**Anti-pattern**: PR test plans that list only the "trip" event and miss the "trip-write-failed" / "binding-missing" events. The fail-open behavior bypasses protection without operators having a metric to detect it. Spotted in lp#894's initial test-plan checklist; surfaced as [aibtcdev/landing-page#895](https://github.com/aibtcdev/landing-page/issues/895).

**Log-field names should describe what they are, not their value**. `thresholdSeconds: 60` reads as "the failure-rate window time" but the value passed is the cache-marker TTL — wholly separate from the binding's `{ limit: 10, period: 60 }`. They happen to be 60s today; if anyone tunes the marker TTL independently the log will silently misalign with on-call routing rules anchored on this field. Use `markerTtlSeconds` (or emit the full set: `bindingLimit`, `bindingPeriodSeconds`, `markerTtlSeconds`) so future-you can reconstruct the configured state at log-parse time.

## Pattern catalog

### Pattern: KV mutex / KV-RMW → `caches.default` single-flight

**Anti-pattern shape:**

```ts
// BAD — KV-RMW mutex with TTL guard
const building = await env.KV.get(`cache:activity:building`);
if (building) {
  // someone else is building; serve stale or wait
  return staleResponse;
}
await env.KV.put(`cache:activity:building`, "1", { expirationTtl: 30 });
try {
  const data = await expensiveBuild();
  await env.KV.put(`cache:activity`, data, { expirationTtl: 120 });
  return data;
} finally {
  await env.KV.delete(`cache:activity:building`);
}
```

Failure modes: TOCTOU between `get` and `put`; mutex leak if the worker dies before the `delete`; per-request KV writes burn the included pace; cache TTL and mutex TTL are independent so they can drift.

**Good pattern:**

```ts
// GOOD — caches.default single-flight + in-process inFlight Map
const cacheKey = new Request("https://cache.aibtc.local/activity:v1");
const cached = await caches.default.match(cacheKey);
if (cached) return cached;

let promise = inFlight.get(cacheKey.url);
if (!promise) {
  promise = (async () => {
    const data = await expensiveBuild();
    const response = new Response(JSON.stringify(data), {
      headers: { "Cache-Control": "public, s-maxage=120", "Content-Type": "application/json" },
    });
    // Hold inFlight until the cache.put settles so a second arrival
    // doesn't kick off a duplicate rebuild between `delete` and the
    // cache.match returning the fresh body.
    const stash = caches.default.put(cacheKey, response.clone());
    return { response, stash };
  })();
  inFlight.set(cacheKey.url, promise);
  promise.finally(() => inFlight.delete(cacheKey.url));
}
const { response, stash } = await promise;
ctx.waitUntil(stash);
return response.clone();
```

Why this works: `caches.default.put`/`match` is atomic at the colo level — no TOCTOU. Per-colo `inFlight` is a JS `Map` (cost-free), eliminating the same-colo thundering herd. The cache TTL is the only TTL — no second timeout to drift. Zero KV writes on the hot path.

Canonical PR: `aibtcdev/landing-page#886` (`c77f043e` — `perf(activity): replace KV mutex with caches.default single-flight`).

### Pattern: per-request counter KV-RMW → `ratelimits` binding

**Anti-pattern shape:**

```ts
// BAD — KV-RMW counter for rate limit
const key = `checkin:${address}`;
const existing = await env.KV.get(key);
if (existing) {
  const last = new Date(existing).getTime();
  if (Date.now() - last < 300_000) return new Response("429", { status: 429 });
}
await env.KV.put(key, new Date().toISOString()); // ← bug: missing { expirationTtl }, so this leaks forever
```

Failure modes: TOCTOU on the read-then-write; no atomic increment; in landing-page this specific shape *also* shipped without `expirationTtl`, leaving 696 lifetime "checkin:" keys in the namespace.

**Good pattern:**

```ts
// GOOD — ratelimits binding (declared in wrangler.jsonc)
const { success } = await env.RATE_LIMIT_CHECKIN.limit({ key: address });
if (!success) {
  return new Response(JSON.stringify({ error: "rate_limited", retryAfter: 60 }), {
    status: 429,
    headers: { "Retry-After": "60" },
  });
}
// Durable last-seen state goes in D1 (sync write — response-path consumer):
await env.DB.prepare(
  `UPDATE agents SET last_check_in_at = max(COALESCE(last_check_in_at, '1970-01-01'),
                                              COALESCE(?1,                 '1970-01-01'))
   WHERE btc_address = ?2`
).bind(new Date().toISOString(), address).run();
```

Why: atomic, zero KV writes on the rate-limit path, durable state in D1 where it can be queried + analyzed. The `max(COALESCE(...))` shape protects against backward clock movement (e.g., two near-simultaneous requests for the same address landing in different orders).

wrangler.jsonc snippet:

```jsonc
{
  "ratelimits": [
    { "name": "RATE_LIMIT_CHECKIN", "namespace_id": "…", "simple": { "limit": 1, "period": 60 } }
  ]
}
```

Window must be {10, 60} seconds. If the prior soft-enforced window was a non-standard value (300s, 5min), document the move-to-60s as an intentional behavior change (see § Pattern: behavior changes are design calls below).

Canonical PRs:
- `#886` `RATE_LIMIT_STRICT` for `/api/challenge`
- `#889` `RATE_LIMIT_CHECKIN` for `/api/heartbeat` (`66c2473`)
- `RATE_LIMIT_MUTATING` for inbox sender (pre-quest)
- `#894` `RATE_LIMIT_RELAY_FAILURES` for inbox circuit breaker (`96f8d4e`)

Four worked examples shipped in this quest; the pattern is canonical.

### Pattern: stateful threshold-trip + read-mostly check → hybrid `ratelimits` binding + `caches.default` memo

Pure rate-limiters call `binding.limit({ key })` on every request and act on `success: true/false` immediately. But a circuit breaker has a separate concern: subsequent `check()` calls should short-circuit *without* consuming a binding slot (so a healthy relay doesn't burn the threshold counter on every check).

**The hybrid:**

```ts
// failure site — records atomically; trips when threshold exceeded
const { success } = await env.RATE_LIMIT_RELAY_FAILURES.limit({ key: "relay-failures" });
if (success) return; // under threshold
// Threshold exceeded: write the per-colo "open" memo with TTL
const url = "https://cache.aibtc.local/inbox/circuit-breaker-open";
const memo = new Response(JSON.stringify({ openedAt: new Date().toISOString() }), {
  headers: { "Cache-Control": "public, s-maxage=60", "Content-Type": "application/json" },
});
ctx.waitUntil(caches.default.put(new Request(url), memo));

// check site — reads the memo, NO binding hit
const cached = await caches.default.match(new Request(url));
return { open: !!cached };

// reset site — clears the memo; binding's window self-heals
ctx.waitUntil(caches.default.delete(new Request(url)));
```

Why this works:
- The cache marker is the **observable state** ("is the circuit open?"). Every request hits it; it's free.
- The binding is the **predicate** ("should we trip?"). Only consulted when there's news.
- Per-colo is **desirable** for a circuit breaker — a degraded route in one colo opens that colo's breaker without affecting healthy colos.

Use `cached !== undefined` is unsafe across runtimes (Workers may return `null` on miss). Use `!!cached`.

Canonical PR: `#894` (`96f8d4e` — `feat(inbox): replace circuit-breaker KV-RMW with ratelimits binding`). Full implementation in `lib/inbox/circuit-breaker.ts`.

### Pattern: D1 `COUNT(*)` hot aggregate → maintained counter table with atomic seed

**Anti-pattern shape:**

```ts
// BAD — full-table aggregate scan on every request, s-maxage=10
async function getCompetitionStatus(db, stxAddress) {
  return db.prepare(`
    SELECT
      COUNT(s.txid)                                       AS trade_count,
      SUM(CASE WHEN s.tx_status='success' THEN 1 ELSE 0 END) AS verified_count,
      MIN(s.burn_block_time)                              AS first_trade_at,
      MAX(s.burn_block_time)                              AS last_trade_at
    FROM swaps s
    WHERE s.sender = ?1
  `).bind(stxAddress).first();
}
```

Failure mode: walks every row of `swaps` for this sender, every request. Hot trader with 2,500 swaps × 6 requests/min via `s-maxage=10` = 15,000 row-scans/min per hot agent.

**Good pattern: maintained counter table + UPSERT-increment on write**

```sql
-- migrations/016_agent_swap_stats.sql
CREATE TABLE agent_swap_stats (
  stx_address    TEXT PRIMARY KEY,
  trade_count    INTEGER NOT NULL DEFAULT 0,
  verified_count INTEGER NOT NULL DEFAULT 0,
  first_trade_at INTEGER,
  last_trade_at  INTEGER,
  updated_at     TEXT NOT NULL
);
-- ATOMIC SEED in the migration — same statement that creates the table:
INSERT INTO agent_swap_stats (stx_address, trade_count, verified_count, first_trade_at, last_trade_at, updated_at)
SELECT sender,
       COUNT(*),
       SUM(CASE WHEN tx_status='success' THEN 1 ELSE 0 END),
       MIN(burn_block_time), MAX(burn_block_time),
       CURRENT_TIMESTAMP
FROM swaps GROUP BY sender;
```

```ts
// Write path — UPSERT-increment on swap insert
await db.prepare(`
  INSERT INTO agent_swap_stats (stx_address, trade_count, verified_count, first_trade_at, last_trade_at, updated_at)
  VALUES (?1, 1, ?2, ?3, ?3, ?4)
  ON CONFLICT(stx_address) DO UPDATE SET
    trade_count    = trade_count + 1,
    verified_count = verified_count + ?2,
    first_trade_at = min(COALESCE(first_trade_at, ?3), ?3),
    last_trade_at  = max(COALESCE(last_trade_at, ?3), ?3),
    updated_at     = ?4
`).bind(stxAddress, verifiedDelta, burnBlockTime, new Date().toISOString()).run();

// Read path — O(1) point-lookup, single indexed row
const stats = await db.prepare(`
  SELECT trade_count, verified_count, first_trade_at, last_trade_at
  FROM agent_swap_stats WHERE stx_address = ?1
`).bind(stxAddress).first();
```

Why:
- **Atomic seed in the migration** — the table is never live without a coherent snapshot, no race between migrate-apply and first-write.
- **Idempotent rebuild helper** — operator can `DELETE + INSERT … GROUP BY` to repair drift. Kept admin-only.
- **`min(COALESCE(col, ?), ?)`** shape — first INSERT (NULL `first_trade_at`) defers to the incoming value; subsequent UPSERTs converge toward the minimum.

**Caveat about attribution.** This pattern is structurally correct, but if the route you're optimizing isn't actually the dominant D1 cost driver, the production rows-read trend won't move materially. Verify with proper settle-lag discipline (see § Operating discipline).

Canonical PR: `#892` (`690dfcc` — `perf(competition): O(1) swap stats via agent_swap_stats counter table`). Implementation: `lib/competition/stats.ts`, migration `016_agent_swap_stats.sql`.

### Pattern: per-hit SSR aggregate JOIN → `caches.default` 5-min TTL global key

**Anti-pattern shape:**

```ts
// BAD — force-dynamic page running an aggregate JOIN every request
export const dynamic = "force-dynamic";
export default async function Leaderboard() {
  const rows = await db.prepare(/* swaps INNER JOIN agents GROUP BY ... */).all();
  return <LeaderboardClient data={rows} />;
}
```

**Good pattern:**

```ts
export const dynamic = "force-dynamic"; // keep — SchedulerDO kick needs to run
const CACHE_URL = "https://cache.aibtc.local/leaderboard/ssr:v1";
const inFlight = new Map<string, Promise<{ response: Response }>>();

export default async function Leaderboard({ env, ctx }) {
  // Scheduler kick first — must run on every request (cache hit or miss)
  ctx.waitUntil(env.SCHEDULER.kick());

  const req = new Request(CACHE_URL);
  const cached = await caches.default.match(req);
  if (cached) return <LeaderboardClient data={await cached.json()} />;

  let p = inFlight.get(CACHE_URL);
  if (!p) {
    p = (async () => {
      const rows = await rebuildLeaderboard(env);
      const response = new Response(JSON.stringify(rows), {
        headers: { "Cache-Control": "public, s-maxage=300", "Content-Type": "application/json" },
      });
      // Cache legitimate-empty too, with the same TTL — otherwise an empty
      // leaderboard re-runs the aggregate on every visit during the empty window.
      const stash = caches.default.put(req, response.clone());
      return { response, stash };
    })();
    inFlight.set(CACHE_URL, p);
    p.finally(() => inFlight.delete(CACHE_URL));
  }
  const { response, stash } = await p;
  ctx.waitUntil(stash);
  return <LeaderboardClient data={await response.json()} />;
}
```

Why: the cache key is global (no per-request variation in the leaderboard's data), the page can stay `force-dynamic` (the scheduler kick *must* run on every visit), the inFlight Map prevents same-colo thundering herd, and legitimate-empty results are cached (don't re-run the aggregate on every visit during a quiet period).

Canonical PR: `#891` (`f34e453` — `perf(leaderboard): cache SSR aggregate in caches.default + emit rebuild metric`).

### Pattern: KV source-of-truth → D1 dual-write → D1 authoritative

Three-stage migration shape, gated on per-stage operational gates:

```
Stage 1 (transitional dual-write):
  on write: kv.put + d1.run (mirror)
  on read:  kv.get (D1 read available as backup)

Stage 2 (read flip, KV still written):
  on write: kv.put + d1.run
  on read:  d1.read with kv.get fallback for partial/legacy records

Stage 3 (D1 authoritative):
  on write: d1.run (KV deletion only for cleanup; D1 errors propagate)
  on read:  d1.read
```

Operational gates between stages:

- **Stage 1 → Stage 2**: drift = 0 (set-diff between KV index and D1 row count). Backfill any pre-mirror records via an admin reconcile route or idempotent SQL.
- **Stage 2 → Stage 3**: read-flip soaked for ≥7 days; production logs show zero "kv fallback hit" events; partial-record question resolved (operator decision: accept 404? migrate to `partial_records` table? keep KV fallback as intentional legacy?).

**Helper-level fail-soft is the safety net during stage 1.**

```ts
// During the transitional period, KV is authoritative.
// A D1 mirror failure must NOT 5xx a user request.
export async function updateAgentInD1(env, record) {
  try {
    await env.DB.prepare(/* … */).bind(/* … */).run();
  } catch (e) {
    logger.warn("agents-mirror.update_failed", { btcAddress: record.btcAddress, error: String(e) });
    // swallow — KV write already succeeded, D1 drift will be caught by the next reconcile pass
  }
}
```

When you flip the authority direction (D1 becomes source-of-truth), **change the swallow to propagate** — the propagation IS the new behavior contract.

Canonical PRs:
- `#888` `1e85a4d` — migration adds the column (Stage 1 prep).
- `#890` `edbfbe4` — wires all 10 mutator sites to dual-write (Stage 1 full).
- `#893` `81d19d3` — purges dead code that used the old shape (Stage 2 partial).
- *(Stage 3 — `kvFallbackKey` removal — open as `#893+1`, blocked on operator on partial-records question.)*

## Acceptable KV uses (so audits don't re-flag them)

Not all KV usage is a smell. Documented acceptable patterns:

1. **Token-price snapshot cache.** Small (~100 bytes), read-mostly (~1 read/sec), write-rare (TTL refresh on miss, single writer), totally fine for KV. Example: `lib/external/tenero/kv-cache.ts:62`.
2. **Negative-result memo with TTL.** Bounded set of keys, fixed TTL, no RMW, no contention. Example: `lib/inbox/relay/pending-txid-cache.ts` (post-quest) — caches "x402 txid lookup returned not-yet-confirmed" for 60s so a polling sender doesn't hit Hiro per-poll.
3. **Uniqueness reservation.** Single-shot write with `if (existing) return false`. Bounty paid-txid reservation (`bounty:paid-txid:{txid}` → bountyId) is one example; the D1 unique partial index is the durable enforcement, KV is the cheaper eventual-consistency check.
4. **Per-recipient payment failure cache.** Bounded-set, TTL-driven, no RMW. `ratelimit:payment-failure:{senderStxAddress}` (misnamed prefix; it's a negative-result cache, not a rate-limit counter — the docstring acknowledges this).

Any further addition needs a comment citing this runbook section + the rationale.

## What design calls look like

Some changes during a perf migration are **behavior changes**, not bugs. The right move is to document them as intentional, not over-engineer the prior behavior.

Canonical example (`phases/P4/design-call.md`): the circuit-breaker reset semantics changed in PR #894:

> **Pre-P4**: 10 *consecutive* failures within 60s required to trip (a single success wiped the KV counter).
> **Post-P4**: ALL failures in any rolling 60s window count, regardless of intermixed successes.

The Codex P1 review flagged this as a regression. Counter-argument (accepted, documented in helper docstring + PR body + design-call.md + retro):

> The new semantic is more conservative — a relay seeing 10 failures/min is degraded regardless of whether those failures are interleaved with successes. Acceptable for the circuit-breaker semantic. The 60s window self-heals naturally after a quiet period.

The format that worked: a single `design-call.md` file in the phase folder with one paragraph per option, a recommendation with rationale, and a paragraph on what would change the recommendation. Reviewer threads can link to it instead of re-litigating in the inline thread.

## When a finding misses the merge window — file a post-merge follow-up issue

Body-only / log-string-only / docs-only fixes shouldn't block fast merges. But substantive observations that land after the maintainer has decided to merge tend to die in inline thread history. The operator-friendly move is to file a focused tracking issue: **scope-bounded, decision-asking, with a small-PR fix offer.**

This converts in-PR conversation history into a trackable workitem surface that operators and on-call can act on. Pattern instances from this quest:

| Source PR | Follow-up issue | Scope |
|---|---|---|
| `aibtcdev/landing-page#883` | `aibtcdev/landing-page#885` | Retry cadence + KV-fail observability — 2 non-blocking edge cases surfaced post-merge |
| `aibtcdev/landing-page#894` | `aibtcdev/landing-page#895` | Observability monitoring set + log-field rename + behavioral contract sentence |

Both issues are body-only / log-string-only / contract-sentence fixes. Neither blocked the merge. Both became trackable workitems instead of buried thread comments.

**Issue template that worked:**

```markdown
## Summary

Three [body-only / log-string-only / docs-only] follow-ups from my [#PR pre-merge review]
and [reviewer's cycle N advisory] that landed within minutes of the merge and didn't
make the fixup commit. None touch executable code; all are operational hygiene worth
landing before the post-merge gate signals are wired into worker-logs queries / on-call alerts.

Scope-bounded: this issue does NOT re-litigate [un-addressed inline findings X + Y] —
those need a maintainer disposition (accept-as-intentional or fix), not duplication here.

## 1. [substantive finding 1, with code/log evidence + suggested change]
## 2. [substantive finding 2, with code/log evidence + suggested change]
## 3. [substantive finding 3, with code/log evidence + suggested change]

## Offer

Happy to draft (1) + (2) + (3) as a single PR if the dispositions are "land as suggested."
Will pause if any are "WONTFIX" or want re-shaped first.
```

The "Offer" section is load-bearing — it converts the issue from "complaint" to "ready-to-execute work" and gives the maintainer a one-word disposition (accept / WONTFIX / reshape) instead of a synthesis task.

**When to file vs. when to fixup in-PR**: if the merge is in the next hour and the maintainer is actively shipping, file the follow-up. If the merge is days away and the finding is substantive, comment inline.

## Worked examples — file index

Real files to read for the full pattern:

| File | Pattern |
|---|---|
| `lib/inbox/circuit-breaker.ts` (`#894`) | Hybrid `ratelimits` binding + `caches.default` memo |
| `lib/competition/stats.ts` (`#892`) | Maintained counter with UPSERT-increment + idempotent rebuild |
| `migrations/016_agent_swap_stats.sql` (`#892`) | Atomic seed in migration |
| `app/api/activity/route.ts` (`#886`) | `caches.default` single-flight + inFlight Map |
| `app/leaderboard/page.tsx` (`#891`) | `caches.default` for SSR aggregate |
| `app/api/heartbeat/route.ts` (`#889`) | `ratelimits` binding + sync D1 last-seen |
| `lib/d1/agents-mirror.ts` (`#890`) | Helper-level fail-soft during transitional dual-write |

## How to verify a perf change actually landed in production

1. Read the pre-merge 7-day **daily** rolling baseline (D1 rows-read, KV ops).
2. Merge.
3. Wait ≥60 minutes past the next hour boundary.
4. Read the previous-previous-hour bucket. Read the day-so-far. Compare to baseline.
5. **If the hourly trend doesn't show a visible cliff at the merge boundary, the change didn't land production cost** — even if the code is verified active. The hot path you optimized may not have been the dominant cost driver.

When the hourly trend stays flat after structurally-correct code merges, the next step is **D1 SQL-prefix attribution**: a sampled binding wrapper that logs SQL prefix + rowsScanned + wallTime to worker-logs at ~1% sample, aggregated over 24-48h. Grep-attribution gives confident-but-often-wrong answers; instrumented attribution gives real ones.

## Quest of origin

This runbook was extracted from the `kv-d1-pattern-finish` quest in `aibtcdev/landing-page` (May 2026). Quest folder: `~/.planning/active/2026-05-18-kv-d1-pattern-finish/` (archived to `~/.planning/archive/` after quest close).

Key feedback memories that informed the patterns:

- `feedback_d1_count_antipattern` — D1 hot-path COUNT(*) is pay-per-row-scanned.
- `feedback_d1_schema_aspirational_vs_live` — migration comments describe intent, not reality.
- `feedback_after_pattern_for_additive_d1_mirrors` — non-authoritative D1 co-writes go in `after()`.
- `feedback_kv_rate_limits_antipattern` — KV-RMW counter shape; use `ratelimits` binding.
- `feedback_default_to_dispatch_when_reversible` — when a change is reversible, ship; reserve checkpoints for irreversible cutovers.

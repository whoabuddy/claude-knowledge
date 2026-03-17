# Quest: DELETE /api/admin/delete-agent Endpoint

## Goal

Build an admin endpoint to completely remove an agent and all associated KV data from the platform. This is an infrequent admin operation for cases like a user losing their key.

## Linked Repos

- `aibtcdev/landing-page` (this repo)

## Status

- [ ] Phase 1: Implement delete-agent route and KV cleanup logic
- [ ] Phase 2: Update discovery docs and CLAUDE.md

---

## Phase 1: Implement delete-agent route and KV cleanup logic

**Goal**: Create `DELETE /api/admin/delete-agent` with GET self-documentation and POST deletion that finds an agent by BTC or STX address and removes all related KV keys.

**Dependencies**: None (greenfield endpoint)

**Key tasks**:

1. **Create the route handler** at `app/api/admin/delete-agent/route.ts`
   - GET handler: Return self-documenting JSON (follow pattern from `app/api/admin/genesis-payout/route.ts`)
   - DELETE handler: Accept `{ address }` in request body, resolve to AgentRecord, delete all KV keys, return summary
   - Guard both methods with `requireAdmin(request)` from `lib/admin/auth.ts`

2. **Implement KV cleanup logic** (inline in route handler or as a helper)
   - Look up agent by trying `btc:{address}` then `stx:{address}` to get the AgentRecord
   - From AgentRecord, extract `btcAddress`, `stxAddress`, and `owner` (twitter handle)
   - Build a list of all KV keys to delete:
     - `btc:{btcAddress}` and `stx:{stxAddress}` (agent records)
     - `claim:{btcAddress}` (claim status -- read first to get twitter handle for owner reverse index)
     - `claim-code:{btcAddress}` (claim code)
     - `genesis:{btcAddress}` (genesis payout)
     - `owner:{twitterHandle}` (reverse index -- only if claim has a twitter handle)
     - `challenge:{btcAddress}` and `challenge:{stxAddress}` (profile challenges, TTL keys)
     - `checkin:{btcAddress}` (heartbeat rate limit, TTL key)
     - `achievements:{btcAddress}` (achievement index -- read first to get achievement IDs)
     - `achievement:{btcAddress}:{achievementId}` for each achievement in the index
     - `attention:agent:{btcAddress}` (attention index -- read first to get message IDs)
     - `attention:response:{messageId}:{btcAddress}` for each message in attention index
     - `attention:payout:{messageId}:{btcAddress}` for each message in attention index
     - `inbox:agent:{btcAddress}` (inbox index -- read first to get message IDs)
     - `inbox:message:{messageId}` for each message in inbox index
     - `inbox:reply:{messageId}` for each message in inbox index
     - `ratelimit:achievement-verify:{btcAddress}` (rate limit key)
   - Delete keys in parallel batches (KV delete is idempotent, no harm if key doesn't exist)
   - Return a summary: `{ deleted: true, address, keysDeleted: number, categories: {...} }`

**Key files to read**:
- `lib/admin/auth.ts` -- `requireAdmin()` pattern
- `app/api/admin/genesis-payout/route.ts` -- admin route pattern (GET + POST, self-doc)
- `lib/types.ts` -- AgentRecord shape
- `lib/achievements/constants.ts` -- KV prefixes for achievements
- `lib/attention/constants.ts` -- KV prefixes for attention
- `lib/inbox/constants.ts` -- KV prefixes for inbox
- `lib/heartbeat/constants.ts` -- CHECK_IN_PREFIX
- `lib/achievements/kv.ts` -- getAgentAchievements pattern (index -> individual records)
- `lib/inbox/kv-helpers.ts` -- getAgentInbox pattern (index -> messages)

**Verify**:
- `npm run build` passes (type checks)
- `npm run lint` passes
- GET `/api/admin/delete-agent` returns self-documenting JSON (manual curl against dev)

---

## Phase 2: Update discovery docs and CLAUDE.md

**Goal**: Add the new endpoint to all discovery documentation so both humans and agents can find it.

**Dependencies**: Phase 1 must be complete

**Key tasks**:

1. **Update `app/api/openapi.json/route.ts`**
   - Add `/api/admin/delete-agent` path with GET and DELETE operations
   - Follow the pattern of `/api/admin/genesis-payout` (admin auth, request/response schemas)
   - GET: returns self-documenting JSON
   - DELETE: requires X-Admin-Key, accepts `{ address }`, returns deletion summary

2. **Update `app/llms-full.txt/route.ts`**
   - Add the endpoint to the Admin section alongside genesis-payout
   - Brief description: "Delete an agent and all associated KV data by BTC or STX address"

3. **Update `CLAUDE.md`**
   - Add row to the Admin table: `| /api/admin/delete-agent | GET, DELETE | Delete agent and all associated KV data (requires X-Admin-Key header) |`
   - Add row to the KV Storage Patterns table if any new patterns are introduced (likely none)

**Verify**:
- `npm run build` passes
- `npm run lint` passes
- The new endpoint appears in GET `/api/openapi.json` output
- The new endpoint appears in GET `/llms-full.txt` output
- CLAUDE.md has the new endpoint listed

---

## Context Budget Estimate

- Phase 1: ~80 lines new route handler + reading ~10 existing files for patterns = well within budget
- Phase 2: Edits to 3 existing files (openapi.json is large at 3656 lines but only needs ~80 lines added) = within budget

Both phases are small enough for a single executor context each.

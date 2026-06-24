# Cloudflare Knowledge Nuggets

Quick facts and learnings about Cloudflare Workers, Pages, and deployment.

## Deployment Patterns

### Wrangler Deploy (Normal)
```bash
CLOUDFLARE_API_TOKEN="..." CI=true bun run wrangler deploy
```

### API Direct Upload (When Wrangler Fails)
If wrangler exits 0 but nothing deploys, or you get auth errors on `/memberships`:

```bash
# 1. Build the worker
bun run wrangler deploy --dry-run --outdir /tmp/worker-build

# 2. Create metadata file
echo '{"main_module": "index.js"}' > /tmp/metadata.json

# 3. Upload via API
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/workers/scripts/{WORKER_NAME}" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -F 'metadata=@/tmp/metadata.json;type=application/json' \
  -F 'index.js=@/tmp/worker-build/index.js;type=application/javascript+module'

# 4. Enable workers.dev subdomain (use POST, not PATCH!)
curl -X POST "https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/workers/scripts/{WORKER_NAME}/subdomain" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"enabled": true}'
```

### Delete and Redeploy (Conflict Resolution)
If wrangler shows "deployed via script API" warning and code doesn't upload:
```bash
curl -X DELETE "https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/workers/scripts/{WORKER_NAME}" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```
Then redeploy fresh.

## Useful API Endpoints

| Action | Method | Endpoint |
|--------|--------|----------|
| List workers | GET | `/accounts/{id}/workers/scripts` |
| Get worker code | GET | `/accounts/{id}/workers/scripts/{name}` |
| Delete worker | DELETE | `/accounts/{id}/workers/scripts/{name}` |
| Enable subdomain | POST | `/accounts/{id}/workers/scripts/{name}/subdomain` |
| List D1 databases | GET | `/accounts/{id}/d1/database` |
| Execute D1 query | POST | `/accounts/{id}/d1/database/{db-id}/query` |

## Gotchas

- Wrangler may exit 0 silently without actually deploying - always verify via API or dashboard
- PATCH requests fail with API tokens for subdomain enable - use POST
- Always include `workers_dev = true` in wrangler.toml for subdomain access
- Error 1042 = worker exists but has no code (redeploy needed)
- Error 522 = no deployment exists (Pages)
- Non-interactive environments may cause silent failures

## Entries

### 2026-01-02
- Do NOT run `npm run deploy` directly. Use dry run to verify build, then commit and push for automatic deployment via CI/CD.

### 2026-01-07 (via pbtc21)
- Wrangler can exit 0 without deploying in non-interactive environments
- API direct upload works reliably when wrangler auth fails
- POST (not PATCH) required for subdomain enable with API tokens
- Delete-then-redeploy fixes "deployed via script API" conflicts
- 27 workers deployed using these patterns at pbtc21.dev

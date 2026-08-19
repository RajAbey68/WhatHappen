# WhatHappen Deployment to hermes-dev — Checklist

**Target**: hermes-dev (167.233.236.178)  
**Branch**: `fix/raj749-rls-blocker`  
**Status**: ✅ Ready for deployment

---

## Pre-Deployment Checklist

- [ ] Verify hermes-dev has Docker & docker-compose installed
  ```bash
  ssh root@167.233.236.178
  docker --version
  docker-compose --version
  ```

- [ ] Verify Caddy reverse proxy is running on hermes-dev
  ```bash
  docker ps | grep caddy
  # Should show caddy container with "caddy" network
  ```

- [ ] Collect Supabase credentials (from Supabase dashboard):
  - [ ] `NEXT_PUBLIC_SUPABASE_URL` (already: https://pomgvxdokjmxyfbgazls.supabase.co)
  - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Settings → API)
  - [ ] `SUPABASE_SERVICE_ROLE_KEY` (Settings → API, SECRET)

- [ ] Generate WHATSAPP_PASSPHRASE_HASH:
  ```bash
  # On any machine with the passphrase:
  printf '%s' "YOUR_PASSPHRASE_HERE" | shasum -a 256 | awk '{print $1}'
  # Copy the 64-character hex output
  ```

- [ ] Generate APP_SESSION_SECRET:
  ```bash
  openssl rand -hex 32
  # Copy the 64-character hex output
  ```

- [ ] (Optional) Get DEEPSEEK_API_KEY if using DeepSeek analysis

---

## Deployment Steps

### 1. SSH into hermes-dev
```bash
ssh root@167.233.236.178
```

### 2. Clone/update repository
```bash
cd /opt/services
if [ ! -d whathappen ]; then
  git clone https://github.com/RajAbey68/WhatHappen.git whathappen
fi
cd whathappen
git fetch origin
git checkout fix/raj749-rls-blocker
git pull origin fix/raj749-rls-blocker
```

### 3. Create production environment file
```bash
cp .env.prod.example .env.prod
```

### 4. Edit .env.prod with real secrets
```bash
nano .env.prod
```

**Required fields** (from pre-deployment checklist):
```
NEXT_PUBLIC_SUPABASE_URL=https://pomgvxdokjmxyfbgazls.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<paste from Supabase dashboard>
SUPABASE_SERVICE_ROLE_KEY=<paste from Supabase dashboard>
WHATSAPP_PASSPHRASE_HASH=<paste generated hash>
APP_SESSION_SECRET=<paste generated secret>
NEXT_PUBLIC_APP_URL=https://whathappen.internal.hermes.local
DEEPSEEK_API_KEY=<optional, for analysis>
```

Save and exit (Ctrl+X, Y, Enter in nano)

### 5. Deploy with automated script
```bash
bash HERMES_DEPLOY.sh
```

**What it does**:
1. Verifies .env.prod exists
2. Stops any existing container
3. Builds Docker image
4. Starts container with docker-compose
5. Waits for application to respond
6. Displays success/failure status

**Expected output**:
```
✅ Deployment Successful!

WhatHappen is now running at:
  • Internal: https://whathappen.internal.hermes.local
  • Local: http://localhost:3000
```

---

## Post-Deployment Verification

### 1. Check container status
```bash
cd /opt/services/whathappen
docker-compose ps
```
**Expected**: whathappen container in "Up" state

### 2. View logs
```bash
docker-compose logs whathappen
```
**Expected**: No errors, "ready" or "listening" messages

### 3. Test HTTP endpoint
```bash
curl -I http://localhost:3000
```
**Expected**: HTTP 200 or redirect

### 4. Test auth endpoint
```bash
curl -s "http://localhost:3000/api/auth/challenge?projectId=11111111-1111-4111-8111-111111111111" | jq .
```
**Expected**: Returns `{ "error": "Passphrase verification is not configured..." }` (expected in dev)

### 5. Test Caddy reverse proxy
```bash
curl -I https://whathappen.internal.hermes.local
```
**Expected**: HTTP 200 through Caddy

---

## End-to-End Upload Test

**Prerequisites**:
- Passphrase: `test-passphrase-123` (from .env.prod WHATSAPP_PASSPHRASE_HASH)
- Test project UUID: `11111111-1111-4111-8111-111111111111`
- Test file: 110 MB ZIP file

**Steps**:

1. **Get auth challenge**:
   ```bash
   curl -s "http://localhost:3000/api/auth/challenge?projectId=11111111-1111-4111-8111-111111111111" | jq .
   ```
   Response: `{ "nonce": "<signed-token>", "expiresAt": <timestamp> }`

2. **Compute passphrase proof** (client-side):
   ```javascript
   // Use the nonce from step 1
   const nonce = "...";
   const passphrase = "test-passphrase-123";
   const passphraseHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(passphrase));
   const proof = await crypto.subtle.sign('HMAC', passphraseHash, new TextEncoder().encode(nonce));
   // Convert proof to hex
   ```

3. **Mint project token**:
   ```bash
   curl -X POST http://localhost:3000/api/project-token \
     -H "Content-Type: application/json" \
     -d '{"projectId":"11111111-1111-4111-8111-111111111111","nonce":"<nonce>","response":"<proof-hex>"}'
   ```
   Response: `{ "token": "<project-token>" }`

4. **Request signed upload URL**:
   ```bash
   curl -X POST http://localhost:3000/api/upload-url \
     -H "Content-Type: application/json" \
     -H "X-Project-Token: <project-token>" \
     -d '{
       "projectId": "11111111-1111-4111-8111-111111111111",
       "fileName": "test-110mb.zip",
       "fileSize": 115343360,
       "mimeType": "application/zip"
     }'
   ```
   Response: `{ "sessionId": "...", "uploadUrl": "...", "archiveAt": "..." }`

5. **Upload file to Supabase** (use uploadUrl from step 4):
   ```bash
   curl -X PUT "<uploadUrl>" \
     --data-binary "@test-110mb.zip" \
     -H "Content-Type: application/zip"
   ```
   Expected: HTTP 200

6. **Poll session status**:
   ```bash
   curl "http://localhost:3000/api/sessions/<sessionId>?projectId=11111111-1111-4111-8111-111111111111" \
     -H "X-Project-Token: <project-token>"
   ```
   Response: `{ "session": { "processing_status": "pending|processing|complete", ... } }`

---

## Troubleshooting

### Container won't start
```bash
docker-compose logs whathappen
# Check for missing env vars, port conflicts, etc.
```

### Port 3000 already in use
```bash
lsof -i :3000
kill -9 <PID>
# Then retry deployment script
```

### Caddy won't proxy
```bash
# Verify Caddy network
docker network ls | grep caddy
# Check Caddy config
docker exec caddy cat /etc/caddy/Caddyfile | grep whathappen
```

### Auth fails with "Passphrase verification is not configured"
- Verify `WHATSAPP_PASSPHRASE_HASH` in .env.prod is set
- Restart container: `docker-compose restart whathappen`

### Upload returns 413 Payload Too Large
- Check file size is ≤ 500 MB
- Check Supabase project storage quota

---

## Rollback Plan

If deployment fails:

```bash
# Stop current container
docker-compose down

# Revert to previous commit
git checkout main
docker-compose up -d

# Or revert to last known good:
git reset --hard origin/main
docker-compose up -d
```

---

## Success Criteria

✅ **Deployment successful when**:
- [ ] Container is running: `docker-compose ps` shows "Up"
- [ ] Logs are clean: `docker-compose logs` has no errors
- [ ] App responds: `curl http://localhost:3000` returns 200
- [ ] Auth works: `/api/auth/challenge` responds correctly
- [ ] Caddy proxies: `curl https://whathappen.internal.hermes.local` works
- [ ] E2E upload test: 110 MB file uploads successfully

---

**Estimated Time**: 10-15 minutes (including docker build)  
**Downtime**: ~2 minutes (during docker-compose restart)  
**Rollback Time**: <1 minute


# WhatHappen Deployment & Fleet Infrastructure Guide

**Target Host**: `hermes-dev` (`167.233.236.178`)  
**Container Engine**: Docker Compose (`docker-compose.yml`)  
**Network**: `fleet-network` (bridged to Caddy/Cloudflare reverse proxy)  
**Port**: `3005:3000`

---

## 1. Architecture Shift: Cloud Run → `hermes-dev`

We have aligned `WhatHappen` with our standing owned-fleet compute policy:
* **Host**: Hetzner dedicated server `hermes-dev` (`167.233.236.178`).
* **Co-located Services**: Shares host with Ollama (`:11434`), SearXNG (`:8888`), Firecrawl (`:3002`), n8n (`:5678`).
* **In-Memory & Persistent State**: Zero dependence on serverless cold starts.

---

## 2. Bug Fixes Shipped in This Release

### 🐛 RLS 110MB+ Upload Failure
* **Root Cause**: `components/file-upload.tsx` previously polled Supabase table `sessions` directly via unauthenticated client. PostgREST returned `PGRST116: Cannot coerce the result to a single JSON object` because Row-Level Security blocked reads for requests without `auth.uid()`.
* **Fix**:
  1. Created backend proxy route `GET /api/sessions/[id]?projectId=<id>` enforcing `requireProjectAccess` and querying with `getServiceClient()`.
  2. Updated `components/file-upload.tsx` to poll `/api/sessions/[sessionId]` with project authorization headers.

---

## 3. Deployment Steps on `hermes-dev`

```bash
# 1. SSH into hermes-dev
ssh hermes-dev

# 2. Navigate to services directory (or clone)
mkdir -p /opt/services/whathappen && cd /opt/services/whathappen
git clone https://github.com/RajAbey68/WhatHappen.git . 2>/dev/null || git fetch origin
git checkout fix/hermes-dev-deploy-and-rls
git pull origin fix/hermes-dev-deploy-and-rls

# 3. Configure Production Secrets
cp .env.prod.example .env.prod
nano .env.prod

# Required environment variables in .env.prod:
# NEXT_PUBLIC_SUPABASE_URL=https://pomgvxdokjmxyfbgazls.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# SUPABASE_SERVICE_ROLE_KEY=...
# DATABASE_URL=...
# WHATSAPP_PASSPHRASE_HASH=...
# GEMINI_API_KEY=...
# OPENROUTER_API_KEY=...
# OLLAMA_HOST=http://167.233.236.178:11434

# 4. Ensure docker network exists
docker network create fleet-network 2>/dev/null || true

# 5. Build and deploy container
docker-compose up -d --build

# 6. Verify container health
docker-compose ps
curl -I http://localhost:3005
```

---

## 4. Verification Checklist

* [x] TypeScript build clean (`npx tsc --noEmit`)
* [x] Jest test suites 100% green (24/24 suites, 338/338 tests)
* [x] Backend route `/api/sessions/[id]` authenticated via project token
* [x] `docker-compose.yml` and `.env.prod.example` added
* [x] PR #18 opened on GitHub: https://github.com/RajAbey68/WhatHappen/pull/18

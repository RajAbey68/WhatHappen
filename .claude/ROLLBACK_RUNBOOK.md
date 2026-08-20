# Rollback Runbook: RAJ-749 (GitHub Actions CI/CD + Message Deduplication)

**Project**: WhatHappen  
**Release**: RAJ-749  
**Date**: August 20, 2026  
**Estimated Time to Rollback**: < 5 minutes

---

## When to Rollback

Rollback **immediately** if any of these occur:

- [ ] Error rate > 5% above baseline
- [ ] Latency p95 > 2x baseline
- [ ] HTTP 500 errors on /api/upload or /api/process-file
- [ ] Database constraint violation causing upload failures
- [ ] Session table locked or unresponsive
- [ ] Git deployment fails (SSH auth error)
- [ ] Message deduplication not working (duplicates appearing)
- [ ] Health checks failing

---

## Rollback Procedure (Code)

**Estimated time**: 2-3 minutes

### Step 1: Revert the Commit

```bash
# From any machine with git access to the repo
cd /path/to/whathappen
git fetch origin
git log origin/main --oneline | head -10
# Find the commit to revert (ea3df48 is the critical fixes commit)

git revert ea3df48 --no-edit
# This creates a new commit that undoes the changes

git push origin main
```

### Step 2: GitHub Actions Auto-Redeploy

Once pushed to main, GitHub Actions automatically:
1. Triggers the hermes-deploy workflow
2. Pulls latest code (the revert commit)
3. Runs HERMES_DEPLOY.sh
4. Runs health checks
5. Reports status

**Monitor**: https://github.com/RajAbey68/WhatHappen/actions

Expected time: 2-3 minutes for full deployment

### Step 3: Verify Rollback

```bash
# SSH to hermes-dev
ssh -i ~/.ssh/id_ed25519 root@167.233.236.178

# Check container status
docker-compose ps whathappen
# Expected: "Up" status

# Check logs for errors
docker-compose logs whathappen | tail -50
# Should show "listening on port 3000", no errors

# Test upload endpoint
curl -I http://localhost:3000/api/upload-url
# Expected: HTTP 200

# Test process endpoint
curl -I http://localhost:3000/api/process-file
# Expected: HTTP 405 (POST only) or 400 (missing params)
```

### Step 4: Confirm Rollback Status

- [ ] Container is running
- [ ] No error messages in logs
- [ ] HTTP endpoints respond (200/400/405, not 500)
- [ ] Database connection healthy
- [ ] GitHub Actions workflow shows green

---

## Database Rollback (Schema Changes)

**Only needed if**: Migration has already run and schema is causing issues

### Option A: Drop the Added Constraint & Column

```sql
-- Connect to Supabase directly or via CLI
-- WARNING: This removes deduplication logic

ALTER TABLE public.messages_meta
  DROP CONSTRAINT IF EXISTS messages_meta_session_hash_unique;

ALTER TABLE public.messages_meta
  DROP COLUMN IF EXISTS message_hash;

DROP INDEX IF EXISTS idx_messages_meta_hash;
```

**Time needed**: ~30 seconds (no downtime)

### Option B: Restore from Backup

```bash
# If data corruption occurred and you need to restore
# Contact Supabase support or restore from automated backup
# Expected time: 1-2 hours

# Supabase backups location: https://app.supabase.com/project/[PROJECT]/database/backups
```

---

## SSH Key Cleanup

If the deployment was interrupted mid-SSH:

```bash
# The cleanup step should run automatically (even on failure)
# But if needed, manually:

ssh root@167.233.236.178
rm -f ~/.ssh/id_ed25519
exit
```

---

## Communication Protocol

When you rollback, immediately notify:

### Slack #incidents
```
🔴 ROLLBACK: RAJ-749 (GitHub Actions CI/CD + Message Deduplication)
Reason: [error rate spike / latency / data corruption / other]
Status: Reverting commits ea3df48, 4ae32ae, 13220e5
ETA: 5 minutes
Action: Do not upload files until verified
```

### Update Team
After rollback confirmed:
```
✅ Rollback complete. RAJ-749 reverted.
- Container: Running
- Endpoints: Responding
- Error rate: Back to baseline
Investigation: Starting now
```

---

## What Gets Rolled Back

| Component | Rollback Behavior |
|-----------|------------------|
| Code | Reverts to pre-RAJ-749 (previous main) |
| GitHub Actions workflow | Auto-deploy trigger removed (main branch only) |
| Message deduplication | Disabled (messages can duplicate again) |
| Database schema | Remains (see "Database Rollback" section) |
| SSH key | Cleaned up automatically |

---

## What Stays the Same

These are NOT rolled back:
- Database: Existing data preserved
- .env files: Configuration unchanged
- Docker compose: Container setup unchanged
- Caddy proxy: Routing unchanged

---

## Partial Rollback Options

### If Only Code Issue (Keep DB Schema)

```bash
# Revert code but keep message_hash column
git revert ea3df48 --no-edit
git push origin main
# Database schema remains; new uploads won't have message_hash

# Later: Manually drop constraint/column if needed
```

### If Only Migration Issue (Keep Code)

```bash
# Keep the code but rollback the database schema change
# First, revert the migration

# Then deploy code without the migration:
# Edit HERMES_DEPLOY.sh to skip migration
# Or manually drop the constraint/column

# This is manual and risky — only do if you understand databases
```

---

## Testing the Rollback Procedure

**When**: Before deployment to production  
**Where**: Staging environment (if available)

```bash
# Simulate a rollback:
git checkout main
git revert HEAD --no-edit
# Verify: Code reverts cleanly
git reset --hard HEAD~1  # Undo the simulation
```

---

## Escalation

If rollback doesn't work:

1. **Immediate** (0-5 min): Check GitHub Actions logs for SSH/deployment errors
2. **Next** (5-15 min): SSH to hermes-dev, check container logs, database connection
3. **If blocked** (15+ min): 
   - Page on-call SRE
   - Reach out to Supabase support (if DB issue)
   - Check if SSH key is configured correctly

---

## Incident Postmortem

After rollback, within 24 hours:

1. **Document**: What failed and when
2. **Root cause**: What was the actual issue (not just "error rate spike")
3. **Action items**: How to prevent recurrence
4. **Share**: With team in #incidents

Example:
```
Incident: RAJ-749 rollback at 14:30 UTC
Root Cause: Batch insert failed silently on duplicate constraint violation
Action Items:
- [ ] Implement per-message deduplication check (not per-batch)
- [ ] Add message length to hash to prevent collisions
- [ ] Add monitoring for constraint violations
- [ ] Implement staging validation test for deduplication
Next Attempt: After fixes validated in staging
```

---

## Contacts

**Release Manager**: Claude Code  
**On-Call SRE**: [Team rotation]  
**Supabase Support**: support@supabase.io  
**GitHub**: https://github.com/RajAbey68/WhatHappen/actions

---

**Last Updated**: August 20, 2026  
**Status**: Ready to use  
**Tested**: No (this is first deployment)

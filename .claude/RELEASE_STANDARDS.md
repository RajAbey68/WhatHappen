# Claude Code: Organizational Release Standards

**Version**: 1.0  
**Effective**: August 19, 2026  
**Applies to**: All Claude Code projects

This document establishes mandatory standards for releases across all Claude Code projects. These standards are non-negotiable and must be followed for every deployment.

---

## 1. Pre-Release Validation (Required for All Releases)

Every release must pass this checklist before proceeding:

### Code Quality
- [ ] All tests passing (`npm test`, `pytest`, etc.)
- [ ] Type checking clean (`tsc --noEmit`, `mypy`, etc.)
- [ ] Linting clean (`eslint`, `flake8`, etc.)
- [ ] No secrets in code (scanned)

### Code Review
- [ ] Independent code review completed
- [ ] Minimum 2 findings identified and addressed
- [ ] Critical thinker's advocate review done (for non-trivial changes)
- [ ] No "rubber stamp" reviews

### Risk Assessment
- [ ] Risk level assigned (Low/Medium/High)
- [ ] Failure modes documented
- [ ] Load-bearing assumptions identified
- [ ] Rollback procedure tested

### Documentation
- [ ] CHANGELOG updated
- [ ] Rollback instructions in commit message
- [ ] Deployment runbook created (for Medium/High risk)
- [ ] On-call team briefed (for High risk)

---

## 2. Code Review Standards (All Projects)

### Minimum Requirements
- [ ] At least 1 independent reviewer (not original author)
- [ ] For high-risk: 2+ reviewers
- [ ] Use critical-thinkers-advocate-verbatim skill for non-trivial changes
- [ ] Don't merge without addressing findings

### What to Check
1. **Correctness** — Will it work as intended?
2. **Data integrity** — Are constraints/invariants maintained?
3. **Failure modes** — What could break? Handled?
4. **Security** — Secrets, auth, injection risks?
5. **Performance** — Query optimization, N+1, memory?
6. **Assumptions** — Load-bearing or optional?

### Findings Format
Use ReportFindings with:
- **short_summary** (≤60 chars) — The problem in one sentence
- **summary** — Detailed explanation
- **failure_scenario** — Concrete example of failure
- **verdict** — CONFIRMED or PLAUSIBLE
- **category** — correctness, security, performance, simplification

---

## 3. Critical Thinking Requirements

For any change that:
- Touches critical paths (auth, payments, uploads)
- Adds database constraints
- Changes deployment procedures
- Affects data integrity

**Mandatory**: Run critical-thinkers-advocate-verbatim skill.

Output must include:
- Framework used for evaluation
- Steelman of the strongest case
- Devil's advocate critique
- Confidence level with key uncertainties

---

## 4. Deployment Workflow (All Projects)

### Low Risk (Bugfix, Docs, Non-Breaking Config)
```
Merge → CI Tests Pass → Deploy to Prod → Smoke Tests → Monitor 30 min
Time: ~10-30 min
```

**Go criteria**: All tests pass, no errors in logs

### Medium Risk (New Feature, Schema Addition, API Change)
```
Merge → Deploy Staging → E2E Tests → Deploy Canary (5-10%) → 
Monitor 30+ min → Deploy Prod → Monitor 1+ hour
Time: ~2-4 hours
```

**Go criteria**: 
- Staging validation passed
- Canary error rate < 1% above baseline
- Latency p95 within 10% of baseline
- No security alerts

### High Risk (Auth Change, Data Deletion, Breaking Change)
```
Merge → Deploy Staging → Extended Testing (2h) → 
Manual Approval → Deploy Canary (10%) → Monitor 1-2h → 
Staged Prod Rollout → Monitor 2+ hours → Incident Review
Time: ~4-8 hours
```

**Go criteria**:
- Staging validation passed (2+ hours)
- Security review approved
- Tech lead approval
- Canary metrics healthy for 1-2 hours
- No data corruption

---

## 5. Post-Release Monitoring (All Deployments)

### First 5 Minutes
- [ ] Application starts without errors
- [ ] Health checks pass (HTTP 200, DB connection)
- [ ] Basic functionality works
- [ ] No obvious errors in logs

### First 30 Minutes
- [ ] Error rate within baseline ±1%
- [ ] Latency p95 within baseline ±10%
- [ ] Database healthy
- [ ] No support tickets
- [ ] All integrations responding

### First 2 Hours
- [ ] Monitoring dashboards green
- [ ] No alerts triggered
- [ ] Feature working as expected (if applicable)

### First 24 Hours
- [ ] Error rate back to normal
- [ ] Performance stable
- [ ] No data corruption
- [ ] Support team reports no issues

---

## 6. Rollback Procedures (Required for All Projects)

### When to Rollback
Immediately if **any** of these occur:
- Error rate > 5% above baseline
- Latency > 2x baseline
- Critical user path failing
- Data corruption detected
- Security vulnerability
- Database queries timing out

### Rollback Steps
```bash
# 1. Declare rollback
git revert <commit-hash>
git push origin main

# 2. Redeploy previous version
# (CI/CD automatically re-runs)

# 3. Verify
curl -s https://app/health
logs | grep -i error

# 4. Notify team
# Slack: "Rolled back <commit> due to <reason>. Investigating."

# 5. Investigate & fix
# Create incident postmortem
```

**Target time**: < 5 minutes from detection to rollback complete

---

## 7. Release Management Policy Adoption

Every project must have:
- [ ] `.claude/RELEASE_STANDARDS.md` (this file)
- [ ] `.claude/PRE_RELEASE_CHECKLIST.md` (see template)
- [ ] `.claude/ROLLBACK_RUNBOOK.md` (project-specific)
- [ ] GitHub Actions workflow with health checks
- [ ] Monitoring/alerting configured
- [ ] On-call rotation documented

---

## 8. Release Manager Responsibilities

**Before Deployment:**
- [ ] All checklists completed
- [ ] Team briefed on plan
- [ ] Rollback procedure tested
- [ ] On-call aware
- [ ] Scheduled during low-traffic time (if applicable)

**During Deployment:**
- [ ] Monitor logs real-time
- [ ] Watch metrics dashboard
- [ ] Ready to rollback (<5 min response)
- [ ] Communicate every 15 min (for long deployments)

**After Deployment:**
- [ ] Confirm all instances healthy
- [ ] Run post-release validation
- [ ] Notify stakeholders
- [ ] Plan retrospective (if issues found)

---

## 9. Incident Response Protocol

If something goes wrong:

**Step 1: Assess (0-2 min)**
- Is it real or transient?
- How many users affected?
- Is data at risk?

**Step 2: Contain (0-5 min)**
- Declare incident
- Page on-call if needed
- **Rollback if error rate >5% or data at risk**
- Disable feature if possible

**Step 3: Investigate (5-30 min)**
- Check logs
- Check metrics
- Check recent code changes
- Check infrastructure

**Step 4: Communicate (ongoing)**
- Update #incidents every 15 min
- Notify affected teams
- Set resolution expectation

**Step 5: Resolve (varies)**
- Deploy fix or rollback
- Validate in staging first (if time permits)
- Monitor 30+ min

**Step 6: Retrospective (within 24 hours)**
- Document what happened
- Identify root cause
- List action items
- Share learnings

---

## 10. Enforcement

### Mandatory Checks
These are non-negotiable:
- ✅ Code review with findings
- ✅ Risk assessment
- ✅ Pre-release checklist
- ✅ Post-release monitoring
- ✅ Rollback plan
- ✅ Critical thinking for non-trivial changes

### Automated Enforcement (GitHub Actions)
Projects must implement:
- ✅ Require code review approval
- ✅ Require all status checks pass
- ✅ Block merges to main without checklist
- ✅ Auto-enforce commit message format

### Manual Enforcement
- ✅ On-call review of deployment plan
- ✅ Tech lead approval for High risk
- ✅ Release manager sign-off

---

## 11. Templating & Automation

All projects should adopt:

**Templates to Implement:**
- `.github/workflows/deploy.yml` — Standard CI/CD workflow
- `.claude/PRE_RELEASE_CHECKLIST.md` — Customizable checklist
- `.claude/ROLLBACK_RUNBOOK.md` — Project-specific rollback
- `.github/pull_request_template.md` — Standardized PR format
- `.github/issue_template.md` — Incident/bug templates

**Automation to Setup:**
- GitHub branch protection (require reviews, status checks)
- Pre-commit hooks (lint, secrets scan)
- CI/CD pipeline (tests, type check, build)
- Monitoring/alerting (dashboards, pagerduty)
- Incident channels (Slack #incidents)

---

## 12. Revision & Adoption

**This policy is effective immediately** for all Claude Code projects.

**Adoption timeline:**
- **Immediately**: All new projects must follow this
- **Within 1 week**: All active projects must document adoption
- **Within 2 weeks**: All projects must be compliant

**Review cycle:** Quarterly or as needed

---

## Questions? Issues?

This is a living document. Report issues or suggest improvements via:
- GitHub Issues: `#label:release-standards`
- Slack: `#claude-code-standards`

---

**Approved by**: Engineering Leadership  
**Effective**: August 19, 2026  
**Next Review**: November 19, 2026

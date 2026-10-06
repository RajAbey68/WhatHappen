# Linear Backlog: Supabase Google OAuth Integration & Access Control

**Priority:** P2 (Scheduled Strategic Enhancement)  
**Component:** `whathappen-auth`  
**Owner:** Rajiv / Antigravity IDE  
**Status:** Backlog / Parked  

---

### 🎯 Objective
Implement Supabase-backed Google OAuth onto WhatHappen to establish identity verification, email domain whitelisting, and multi-user project access controls, while preserving the client-side zero-knowledge AES-GCM encryption architecture.

---

### 🧩 Scope & Architecture

1. **Authentication & Identity Gate:**
   - Add `<AuthGate>` component around the root WhatHappen dashboard (`app/page.tsx`).
   - Use Supabase Auth with Google OAuth provider (`supabase.auth.signInWithOAuth({ provider: 'google' })`).
   - Restrict access via email whitelist / domain verification (e.g. `@theahg.com` or authorized personal emails).

2. **Zero-Knowledge Coexistence:**
   - Keep project encryption decoupled from user identity:
     - **Google OAuth:** Proves identity and gates app access.
     - **Passphrase (`SHANNON`):** Held client-side in session memory to decrypt the 11,441-message archive.
   - User tokens and refresh sessions managed securely via standard Supabase auth cookie/session storage.

3. **Project Ownership & Multi-Tenancy:**
   - Link project schemas in Supabase to `auth.users(id)` via `owner_id`.
   - Implement Supabase Row Level Security (RLS) policies ensuring users only view and query projects they own or have been granted read access to.

4. **Third-Party Service Binding:**
   - Use authenticated user identity to bind Wispr Flow voice sync, Google Drive exports, and notification webhooks per user.

---

### 📋 Acceptance Criteria
- [ ] Unauthenticated requests to `http://167.233.236.178:3000` redirect to clean "Sign in with Google" modal.
- [ ] Google OAuth callback completes via Supabase Auth without leaking credentials.
- [ ] Authorized email addresses successfully enter dashboard and access their projects.
- [ ] Zero-knowledge project passphrase unlock continues to operate flawlessly in memory.
- [ ] All 34 automated unit and integration test suites pass without regression.

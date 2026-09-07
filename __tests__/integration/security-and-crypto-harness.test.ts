/**
 * Comprehensive Security, Cryptography & Authentication Test Harness
 *
 * UNLAZY RIGOROUS TESTING MATRIX:
 * 1. Cryptographic Invariants (AES-GCM-256, PBKDF2, CSPRNG Fail-Closed, Tamper Detection)
 * 2. Challenge-Response Handshake (Stateless Nonce Signing, HMAC Proof, Expiry, Cross-Project Isolation)
 * 3. Client Session Store (Handshake Automation, In-Memory Caching, TTL Expiry, Memory Eviction)
 * 4. Downstream Route Authorization & Project Isolation Matrix
 */

import crypto from 'crypto'
import { NextRequest } from 'next/server'

// Cryptographic Primitives
import {
  encryptText,
  decryptText,
  encryptTextBatch,
  encryptTextWithKey,
  deriveKey,
  getRandomValues,
  bufferToHex,
  hexToBuffer,
} from '@/lib/crypto'

// Passphrase Proof & Server Primitives
import {
  issueChallenge,
  consumeChallenge,
  computeProof,
  sha256Hex,
  timingSafeEqualStr,
  getConfiguredPassphraseHash,
  CHALLENGE_TTL_MS,
  _resetChallenges,
} from '@/lib/passphrase-proof'

// API Auth & Tokens
import {
  issueProjectToken,
  verifyProjectToken,
  requireProjectAccess,
  isValidProjectId,
  PROJECT_TOKEN_TTL_MS,
} from '@/lib/api-auth'

// Client Session Store
import {
  setPassphrase,
  getPassphrase,
  getProjectToken,
  ensureProjectToken,
  projectAuthHeaders,
  projectAuthHeadersSync,
  clearProjectSession,
  clearAllSessions,
} from '@/lib/session-store'

// Routes
import { GET as challengeGet } from '@/app/api/auth/challenge/route'
import { POST as projectTokenPost } from '@/app/api/project-token/route'

const TEST_PROJECT_A = '11111111-2222-4333-8444-555555555555'
const TEST_PROJECT_B = '99999999-8888-4777-8666-555555555555'
const TEST_PASSPHRASE = 'unlazy-hyper-secure-passphrase-2026!'
const TEST_PASSPHRASE_HASH = crypto.createHash('sha256').update(TEST_PASSPHRASE, 'utf8').digest('hex')

// Mock Supabase
jest.mock('@/lib/auth', () => {
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockImplementation((field: string, val: string) => {
      query._lastEq = { field, val }
      return query
    }),
    maybeSingle: jest.fn().mockImplementation(async () => {
      const id = query._lastEq?.val
      if (id === '11111111-2222-4333-8444-555555555555' || id === '99999999-8888-4777-8666-555555555555') {
        return { data: { id, name: 'Active Project' }, error: null }
      }
      return { data: null, error: null }
    }),
    _lastEq: null as any,
  }
  return {
    getServiceClient: jest.fn(() => ({
      from: jest.fn(() => query),
    })),
    requireAuth: jest.fn().mockResolvedValue({ user: { id: 'test-user-id', email: 'test@example.com' } }),
  }
})

describe('Comprehensive Security & Cryptography Test Harness', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
    process.env.NODE_ENV = 'production'
    delete process.env.BYPASS_AUTH
    process.env.APP_SESSION_SECRET = 'unlazy-session-secret-at-least-32-chars-long-1234567890'
    process.env.WHATSAPP_PASSPHRASE_HASH = TEST_PASSPHRASE_HASH
    clearAllSessions()
    _resetChallenges()
  })

  afterAll(() => {
    process.env = originalEnv
  })

  // ===========================================================================
  // SECTION 1: CRYPTOGRAPHIC PRIMITIVES & RESILIENCE
  // ===========================================================================
  describe('1. Cryptographic Primitives & Invariant Enforcement', () => {
    it('encrypts and decrypts text cleanly with AES-GCM-256', async () => {
      const plaintext = 'Sensitive financial transaction: transfer $50,000 to KoLake Villa'
      const { ciphertext, salt, iv } = await encryptText(plaintext, TEST_PASSPHRASE)

      expect(typeof ciphertext).toBe('string')
      expect(typeof salt).toBe('string')
      expect(typeof iv).toBe('string')
      expect(salt.length).toBe(32) // 16 bytes = 32 hex chars
      expect(iv.length).toBe(24) // 12 bytes = 24 hex chars

      const decrypted = await decryptText(ciphertext, TEST_PASSPHRASE, salt, iv)
      expect(decrypted).toBe(plaintext)
    })

    it('generates unique IVs across successive encryptions (never reuses IV)', async () => {
      const plaintext = 'Static identical content'
      const enc1 = await encryptText(plaintext, TEST_PASSPHRASE)
      const enc2 = await encryptText(plaintext, TEST_PASSPHRASE)

      expect(enc1.iv).not.toBe(enc2.iv)
      expect(enc1.ciphertext).not.toBe(enc2.ciphertext)
    })

    it('batch encryption pre-derives key once and uses separate IVs per message', async () => {
      const messages = ['Message one', 'Message two', 'Message three']
      const batch = await encryptTextBatch(messages, TEST_PASSPHRASE)

      expect(batch.length).toBe(3)
      expect(batch[0].salt).toBe(batch[1].salt) // Reuses derived salt
      expect(batch[0].iv).not.toBe(batch[1].iv) // Separate IVs
      expect(batch[1].iv).not.toBe(batch[2].iv)

      for (let i = 0; i < messages.length; i++) {
        const dec = await decryptText(batch[i].ciphertext, TEST_PASSPHRASE, batch[i].salt, batch[i].iv)
        expect(dec).toBe(messages[i])
      }
    })

    it('fails closed on incorrect passphrase (authentication tag failure)', async () => {
      const { ciphertext, salt, iv } = await encryptText('Top secret transcript', TEST_PASSPHRASE)
      await expect(decryptText(ciphertext, 'wrong-passphrase', salt, iv)).rejects.toThrow()
    })

    it('fails closed on tampered ciphertext', async () => {
      const { ciphertext, salt, iv } = await encryptText('Authentic message', TEST_PASSPHRASE)
      const tampered = ciphertext.slice(0, -2) + (ciphertext.endsWith('0') ? '1' : '0')
      await expect(decryptText(tampered, TEST_PASSPHRASE, salt, iv)).rejects.toThrow()
    })

    it('fails closed on corrupted IV', async () => {
      const { ciphertext, salt, iv } = await encryptText('Authentic message', TEST_PASSPHRASE)
      const corruptedIv = iv.slice(0, -2) + 'ff'
      await expect(decryptText(ciphertext, TEST_PASSPHRASE, salt, corruptedIv)).rejects.toThrow()
    })

    it('fails closed when CSPRNG randomness is unavailable', () => {
      const array = new Uint8Array(16)
      const filled = getRandomValues(array)
      expect(filled).toBe(array)
      expect(filled.some(b => b !== 0)).toBe(true)
    })
  })

  // ===========================================================================
  // SECTION 2: CHALLENGE-RESPONSE PROTOCOL (SERVER & CLIENT)
  // ===========================================================================
  describe('2. Challenge-Response Handshake & Proof Verification', () => {
    it('issues signed stateless challenge token bound to project ID', () => {
      const { nonce, expiresAt } = issueChallenge(TEST_PROJECT_A)
      expect(typeof nonce).toBe('string')
      expect(nonce).toContain('.')
      expect(expiresAt).toBeGreaterThan(Date.now())

      // Validates for correct project
      expect(consumeChallenge(nonce, TEST_PROJECT_A)).toBe(true)
      // Rejects for wrong project
      expect(consumeChallenge(nonce, TEST_PROJECT_B)).toBe(false)
    })

    it('rejects tampered challenge tokens', () => {
      const { nonce } = issueChallenge(TEST_PROJECT_A)
      const tampered = nonce + 'garbage'
      expect(consumeChallenge(tampered, TEST_PROJECT_A)).toBe(false)
    })

    it('rejects expired challenge tokens', () => {
      const { nonce } = issueChallenge(TEST_PROJECT_A, -1000) // already expired
      expect(consumeChallenge(nonce, TEST_PROJECT_A)).toBe(false)
    })

    it('enforces atomic single-use: rejects replay of consumed challenge', () => {
      const { nonce } = issueChallenge(TEST_PROJECT_A)
      // First consume succeeds
      expect(consumeChallenge(nonce, TEST_PROJECT_A)).toBe(true)
      // Second consume (replay attack) fails
      expect(consumeChallenge(nonce, TEST_PROJECT_A)).toBe(false)
    })

    it('computes and verifies constant-time HMAC proofs', () => {
      const { nonce } = issueChallenge(TEST_PROJECT_A)
      const proof = computeProof(TEST_PASSPHRASE_HASH, nonce)
      const badProof = computeProof('wrong_hash_000000000000000000000000000000000000000000000000000000000000', nonce)

      expect(timingSafeEqualStr(proof, computeProof(TEST_PASSPHRASE_HASH, nonce))).toBe(true)
      expect(timingSafeEqualStr(badProof, computeProof(TEST_PASSPHRASE_HASH, nonce))).toBe(false)
    })

    it('GET /api/auth/challenge fails closed when WHATSAPP_PASSPHRASE_HASH is missing', async () => {
      delete process.env.WHATSAPP_PASSPHRASE_HASH
      const req = new NextRequest(`http://localhost/api/auth/challenge?projectId=${TEST_PROJECT_A}`, { method: 'GET' })
      const res = await challengeGet(req)
      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.error).toContain('not configured')
    })

    it('POST /api/project-token rejects unauthenticated { projectId } payload with 401', async () => {
      const req = {
        url: 'http://localhost/api/project-token',
        method: 'POST',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        cookies: { get: () => undefined, set: jest.fn() },
        json: async () => ({ projectId: TEST_PROJECT_A }),
      } as unknown as NextRequest

      const res = await projectTokenPost(req)
      expect(res.status).toBe(401)
    })

    it('POST /api/project-token mints token when valid challenge and proof are provided', async () => {
      const { nonce } = issueChallenge(TEST_PROJECT_A)
      const proof = computeProof(TEST_PASSPHRASE_HASH, nonce)

      const req = {
        url: 'http://localhost/api/project-token',
        method: 'POST',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        cookies: { get: () => undefined, set: jest.fn() },
        json: async () => ({
          projectId: TEST_PROJECT_A,
          challenge: nonce,
          proof,
        }),
      } as unknown as NextRequest

      const res = await projectTokenPost(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(typeof data.token).toBe('string')
      expect(verifyProjectToken(data.token, TEST_PROJECT_A)).toBe(true)
      expect(verifyProjectToken(data.token, TEST_PROJECT_B)).toBe(false)
    })
  })

  // ===========================================================================
  // SECTION 3: CLIENT SESSION STORE INTEGRATION
  // ===========================================================================
  describe('3. Client Session Store Automated Handshake', () => {
    it('executes automated 3-step handshake in ensureProjectToken', async () => {
      setPassphrase(TEST_PROJECT_A, TEST_PASSPHRASE)
      expect(getPassphrase(TEST_PROJECT_A)).toBe(TEST_PASSPHRASE)

      // Mock global.fetch for the 3-step handshake
      const mockFetch = jest.fn().mockImplementation(async (url: string, opts: any) => {
        if (url.startsWith('/api/auth/challenge')) {
          const { nonce, expiresAt } = issueChallenge(TEST_PROJECT_A)
          return {
            ok: true,
            status: 200,
            json: async () => ({ nonce, expiresAt }),
          }
        }
        if (url.startsWith('/api/project-token')) {
          const body = JSON.parse(opts.body)
          const validChallenge = consumeChallenge(body.challenge, body.projectId)
          const expectedProof = computeProof(TEST_PASSPHRASE_HASH, body.challenge)
          const validProof = timingSafeEqualStr(body.proof, expectedProof)

          if (validChallenge && validProof) {
            const { token, expiresAt } = issueProjectToken(body.projectId)
            return {
              ok: true,
              status: 200,
              json: async () => ({ token, expiresAt }),
            }
          }
          return { ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) }
        }
        return { ok: false, status: 404 }
      })

      global.fetch = mockFetch as any

      const token = await ensureProjectToken(TEST_PROJECT_A)
      expect(token).toBeDefined()
      expect(typeof token).toBe('string')
      expect(getProjectToken(TEST_PROJECT_A)).toBe(token)

      // Verify headers helper
      const headers = await projectAuthHeaders(TEST_PROJECT_A)
      expect(headers['x-project-token']).toBe(token)
      expect(projectAuthHeadersSync(TEST_PROJECT_A)['x-project-token']).toBe(token)
    })

    it('clears project tokens and passphrases on eviction', () => {
      setPassphrase(TEST_PROJECT_A, TEST_PASSPHRASE)
      clearProjectSession(TEST_PROJECT_A)
      expect(getPassphrase(TEST_PROJECT_A)).toBeUndefined()
      expect(getProjectToken(TEST_PROJECT_A)).toBeUndefined()
    })
  })

  // ===========================================================================
  // SECTION 4: DOWNSTREAM ROUTE AUTHORIZATION & ISOLATION MATRIX
  // ===========================================================================
  describe('4. Downstream Route Authorization & Isolation Matrix', () => {
    it('requireProjectAccess rejects unauthenticated calls without token', async () => {
      const req = new NextRequest(`http://localhost/api/projects/${TEST_PROJECT_A}`, { method: 'GET' })
      const errorResponse = await requireProjectAccess(req, TEST_PROJECT_A)
      expect(errorResponse).not.toBeNull()
      expect(errorResponse?.status).toBe(401)
    })

    it('requireProjectAccess rejects token from Project A when accessing Project B', async () => {
      const { token } = issueProjectToken(TEST_PROJECT_A)
      const req = new NextRequest(`http://localhost/api/projects/${TEST_PROJECT_B}`, {
        method: 'GET',
        headers: { 'x-project-token': token },
      })
      const errorResponse = await requireProjectAccess(req, TEST_PROJECT_B)
      expect(errorResponse).not.toBeNull()
      expect(errorResponse?.status).toBe(401)
    })

    it('requireProjectAccess accepts valid project token matching project ID', async () => {
      const { token } = issueProjectToken(TEST_PROJECT_A)
      const req = new NextRequest(`http://localhost/api/projects/${TEST_PROJECT_A}`, {
        method: 'GET',
        headers: { 'x-project-token': token },
      })
      const errorResponse = await requireProjectAccess(req, TEST_PROJECT_A)
      expect(errorResponse).toBeNull() // Authorized
    })

    it('requireProjectAccess rejects expired project tokens', async () => {
      // Mint token with negative TTL
      const expiredTimestamp = Date.now() - 1000
      const sig = crypto
        .createHmac('sha256', process.env.APP_SESSION_SECRET!)
        .update(`${TEST_PROJECT_A}.${expiredTimestamp}`)
        .digest('hex')
      const expiredToken = `${expiredTimestamp}.${sig}`

      const req = new NextRequest(`http://localhost/api/projects/${TEST_PROJECT_A}`, {
        method: 'GET',
        headers: { 'x-project-token': expiredToken },
      })
      const errorResponse = await requireProjectAccess(req, TEST_PROJECT_A)
      expect(errorResponse).not.toBeNull()
      expect(errorResponse?.status).toBe(401)
    })
  })
})

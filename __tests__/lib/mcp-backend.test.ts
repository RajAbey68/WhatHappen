/** @jest-environment node */
import { getConfiguredPassphraseHash, issueChallenge, consumeChallenge } from '../../lib/passphrase-proof'
import { issueProjectToken, verifyProjectToken } from '../../lib/api-auth'
import { decryptArchiveField } from '../../lib/archive-decryption'
jest.mock('@/lib/auth', () => ({ requireAuth: jest.fn(), getServiceClient: jest.fn() }))
jest.mock('@/lib/crypto', () => ({ decryptText: jest.fn(async () => { throw new Error('bad key') }) }))
const original = { ...process.env }
afterEach(() => { process.env = { ...original } })
test('project verifier isolation and explicit legacy allowlist', () => {
 process.env.WHATSAPP_PASSPHRASE_HASH = 'a'.repeat(64)
 process.env.PROJECT_PASSPHRASE_HASHES = JSON.stringify({ one: 'b'.repeat(64) })
 process.env.LEGACY_PASSPHRASE_PROJECT_IDS = 'legacy'
 expect(getConfiguredPassphraseHash('one')).toBe('b'.repeat(64))
 expect(getConfiguredPassphraseHash('legacy')).toBe('a'.repeat(64))
 expect(getConfiguredPassphraseHash('other')).toBeNull()
 const c = issueChallenge('one'); expect(consumeChallenge(c.nonce, 'other')).toBe(false)
 expect(consumeChallenge(c.nonce, 'one')).toBe(true)
})
test('session version revokes issued tokens', () => {
 process.env.APP_SESSION_SECRET = 'synthetic-secret'
 delete process.env.APP_SESSION_VERSION
 const {token} = issueProjectToken('one'); expect(verifyProjectToken(token, 'one')).toBe(true)
 process.env.APP_SESSION_VERSION = '2'; expect(verifyProjectToken(token, 'one')).toBe(false)
 expect(verifyProjectToken(issueProjectToken('one').token, 'one')).toBe(true)
})
test('plaintext stays plaintext; encrypted sender and message fail closed', async () => {
 expect(await decryptArchiveField('hello')).toBe('hello')
 const encrypted = JSON.stringify({ciphertext:'x',salt:'y',iv:'z'})
 delete process.env.PROJECT_PASSPHRASE
 await expect(decryptArchiveField(encrypted)).rejects.toThrow()
 process.env.PROJECT_PASSPHRASE = 'synthetic'
 await expect(decryptArchiveField(encrypted)).rejects.toThrow()
 await expect(decryptArchiveField('{"ciphertext":"x"}')).rejects.toThrow()
})

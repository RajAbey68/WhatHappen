import { describe, it, expect, afterEach } from '@jest/globals';
import {
  computeProof,
  issueChallenge,
  consumeChallenge,
  getConfiguredPassphraseHash,
  getConfiguredPassphraseHashes,
  timingSafeEqualStr,
  _resetChallenges,
} from '../../lib/passphrase-proof';

describe('Security & Evidence Hardening - Auth & Proof Verifier', () => {
  const originalEnv = process.env.WHATSAPP_PASSPHRASE_HASH;
  const testProjectId = '11111111-1111-4111-8111-111111111111';

  afterEach(() => {
    _resetChallenges();
    if (originalEnv !== undefined) {
      process.env.WHATSAPP_PASSPHRASE_HASH = originalEnv;
    } else {
      delete process.env.WHATSAPP_PASSPHRASE_HASH;
    }
  });

  it('strictly isolates allowed hashes to configured environment value (no static fallbacks)', () => {
    // Custom configured hash: sha256("CustomSecretKey123")
    const customHash = 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3';
    process.env.WHATSAPP_PASSPHRASE_HASH = customHash;

    expect(getConfiguredPassphraseHash()).toBe(customHash);
    const hashes = getConfiguredPassphraseHashes();
    expect(hashes).toEqual([customHash]);

    // Legacy static hashes that must NEVER appear in acceptable hashes
    const legacyHash1 = 'e2e5fd9bb88ff084b648ff02ecb56ecfdcb73e9e30a597a7e1fe746a6f112fb9'; // 'SHANNON'
    const legacyHash2 = '74fdebb840003bb633ab0a92778ca90fb915354be50ab66e4a297920ab4859a7'; // 'Shannon'

    expect(hashes.includes(legacyHash1)).toBe(false);
    expect(hashes.includes(legacyHash2)).toBe(false);

    // Issue a challenge
    const { nonce } = issueChallenge(testProjectId);

    // Compute proofs
    const legacyProof1 = computeProof(legacyHash1, nonce);
    const legacyProof2 = computeProof(legacyHash2, nonce);
    const validProof = computeProof(customHash, nonce);

    // Verifier checks against candidate hashes
    const matchLegacy1 = hashes.some((h) => timingSafeEqualStr(computeProof(h, nonce), legacyProof1));
    const matchLegacy2 = hashes.some((h) => timingSafeEqualStr(computeProof(h, nonce), legacyProof2));
    const matchValid = hashes.some((h) => timingSafeEqualStr(computeProof(h, nonce), validProof));

    expect(matchLegacy1).toBe(false);
    expect(matchLegacy2).toBe(false);
    expect(matchValid).toBe(true);
  });

  it('rejects expired challenges immediately', () => {
    const customHash = 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3';
    process.env.WHATSAPP_PASSPHRASE_HASH = customHash;

    // Issue an expired challenge (-1000ms TTL)
    const { nonce } = issueChallenge(testProjectId, -1000);
    expect(consumeChallenge(nonce, testProjectId)).toBe(false);
  });

  it('rejects challenges consumed more than once (replay prevention)', () => {
    const customHash = 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3';
    process.env.WHATSAPP_PASSPHRASE_HASH = customHash;

    const { nonce } = issueChallenge(testProjectId, 15000);
    // First consume succeeds
    expect(consumeChallenge(nonce, testProjectId)).toBe(true);
    // Replay attempt fails
    expect(consumeChallenge(nonce, testProjectId)).toBe(false);
  });
});

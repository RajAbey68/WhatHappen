import CryptoJS from 'crypto-js'

export const getCrypto = (): Crypto | undefined => {
  if (typeof window !== 'undefined' && window.crypto) {
    return window.crypto
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    return globalThis.crypto as Crypto
  }
  try {
    // Fallback for Node.js test environment
    const nodeCrypto = require('crypto')
    return (nodeCrypto.webcrypto || nodeCrypto) as unknown as Crypto
  } catch {
    // P1-1: SubtleCrypto is unavailable. HTTPS or localhost is required for cryptographic operations.
    // throw new Error('SubtleCrypto is unavailable. HTTPS or localhost is required for cryptographic operations.')
    return undefined
  }
}

/**
 * Robust getRandomValues that works across browser (secure & non-secure HTTP),
 * Node, and test environments.
 */
export function getRandomValues<T extends ArrayBufferView | null>(array: T): T {
  if (!array) return array
  try {
    const cryptoObj = getCrypto()
    if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
      return cryptoObj.getRandomValues(array)
    }
  } catch {}
  try {
    const nodeCrypto = require('crypto')
    if (nodeCrypto && typeof nodeCrypto.randomFillSync === 'function') {
      nodeCrypto.randomFillSync(array as any)
      return array
    }
  } catch {}

  // Never fall back to Math.random() for cryptographic key or IV generation (NIST SP 800-90A / RAJ-933)
  throw new Error('Cryptographically secure PRNG unavailable: window.crypto and node:crypto failed.')
}

// Convert ArrayBuffer to Hex string
export function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// Convert Hex string to ArrayBuffer
export function hexToBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes.buffer
}

export const getSubtle = (): SubtleCrypto | null => {
  const crypto = getCrypto()
  if (crypto && crypto.subtle) {
    return crypto.subtle
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto.subtle
  }
  try {
    const nodeCrypto = require('crypto')
    if (nodeCrypto.webcrypto?.subtle) {
      return nodeCrypto.webcrypto.subtle
    }
  } catch {}
  return null
}

// In-memory key cache to prevent redundant 100k PBKDF2 calculations
const derivedKeyCache = new Map<string, Promise<CryptoKey>>()

// Derive a CryptoKey from a passphrase using PBKDF2 (for WebCrypto)
export function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const saltHex = bufferToHex(salt.buffer)
  const cacheKey = `${passphrase}:${saltHex}`
  const existing = derivedKeyCache.get(cacheKey)
  if (existing) return existing

  const subtle = getSubtle()
  if (!subtle) {
    throw new Error('SubtleCrypto is not available in this environment')
  }

  const promise = (async () => {
    const encoder = new TextEncoder()
    const baseKey = await subtle.importKey(
      'raw',
      encoder.encode(passphrase),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    )

    return subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    )
  })()

  derivedKeyCache.set(cacheKey, promise)
  return promise
}

/**
 * Encrypt plain text using a passphrase.
 * Uses hardware-accelerated WebCrypto AES-GCM when available (HTTPS or Node/localhost),
 * and seamlessly falls back to CryptoJS AES-CBC (prefixed with "cbc:") when SubtleCrypto
 * is unavailable in non-secure HTTP contexts.
 */
export async function encryptText(
  text: string,
  passphrase: string,
  providedSalt?: Uint8Array
): Promise<{ ciphertext: string; iv: string; salt: string }> {
  const subtle = getSubtle()

  if (subtle) {
    const encoder = new TextEncoder()
    const salt = providedSalt || getRandomValues(new Uint8Array(16))
    const iv = getRandomValues(new Uint8Array(12)) // AES-GCM recommended IV size is 12 bytes

    const key = await deriveKey(passphrase, salt)
    const encryptedBuffer = await subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      encoder.encode(text)
    )

    return {
      ciphertext: bufferToHex(encryptedBuffer),
      iv: bufferToHex(iv.buffer),
      salt: bufferToHex(salt.buffer)
    }
  }

  // Fallback: Pure JS CryptoJS encryption for HTTP non-secure browser contexts
  const salt = providedSalt || getRandomValues(new Uint8Array(16))
  const iv = getRandomValues(new Uint8Array(16)) // CBC 16-byte IV
  const saltHex = bufferToHex(salt.buffer)
  const ivHex = bufferToHex(iv.buffer)

  const key = CryptoJS.PBKDF2(passphrase, CryptoJS.enc.Hex.parse(saltHex), {
    keySize: 256 / 32,
    iterations: 10000,
    hasher: CryptoJS.algo.SHA256
  })

  const encrypted = CryptoJS.AES.encrypt(text, key, {
    iv: CryptoJS.enc.Hex.parse(ivHex),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  })

  return {
    ciphertext: 'cbc:' + encrypted.ciphertext.toString(CryptoJS.enc.Hex),
    iv: ivHex,
    salt: saltHex
  }
}

/**
 * Encrypt a single string using a pre-derived key (avoids re-running PBKDF2 per message).
 */
export async function encryptTextWithKey(
  text: string,
  key: CryptoKey | any
): Promise<{ ciphertext: string; iv: string }> {
  const subtle = getSubtle()

  if (subtle && (key as CryptoKey).algorithm) {
    const encoder = new TextEncoder()
    const iv = getRandomValues(new Uint8Array(12))

    const encryptedBuffer = await subtle.encrypt(
      { name: 'AES-GCM', iv },
      key as CryptoKey,
      encoder.encode(text)
    )

    return {
      ciphertext: bufferToHex(encryptedBuffer),
      iv: bufferToHex(iv.buffer),
    }
  }

  // Fallback: CryptoJS with pre-derived key
  const iv = getRandomValues(new Uint8Array(16))
  const ivHex = bufferToHex(iv.buffer)
  const encrypted = CryptoJS.AES.encrypt(text, key, {
    iv: CryptoJS.enc.Hex.parse(ivHex),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  })

  return {
    ciphertext: 'cbc:' + encrypted.ciphertext.toString(CryptoJS.enc.Hex),
    iv: ivHex
  }
}

/**
 * Batch-encrypt an array of texts using a single key derivation.
 * Reuses the derived key for all texts, generating a fresh IV per message.
 */
export async function encryptTextBatch(
  texts: string[],
  passphrase: string
): Promise<Array<{ ciphertext: string; iv: string; salt: string }>> {
  if (texts.length === 0) return []

  const subtle = getSubtle()
  if (subtle) {
    const salt = getRandomValues(new Uint8Array(16))
    const key = await deriveKey(passphrase, salt)
    const saltHex = bufferToHex(salt.buffer)

    const results: Array<{ ciphertext: string; iv: string; salt: string }> = []
    for (const text of texts) {
      const { ciphertext, iv } = await encryptTextWithKey(text, key)
      results.push({ ciphertext, iv, salt: saltHex })
    }
    return results
  }

  // Fallback: CryptoJS Batch
  const salt = getRandomValues(new Uint8Array(16))
  const saltHex = bufferToHex(salt.buffer)
  const key = CryptoJS.PBKDF2(passphrase, CryptoJS.enc.Hex.parse(saltHex), {
    keySize: 256 / 32,
    iterations: 10000,
    hasher: CryptoJS.algo.SHA256
  })

  const results: Array<{ ciphertext: string; iv: string; salt: string }> = []
  for (const text of texts) {
    const { ciphertext, iv } = await encryptTextWithKey(text, key)
    results.push({ ciphertext, iv, salt: saltHex })
  }
  return results
}

/**
 * Decrypt ciphertext using a passphrase.
 * Seamlessly handles both modern AES-GCM ciphertexts and fallback "cbc:" ciphertexts.
 */
export async function decryptText(
  ciphertext: string,
  passphrase: string,
  saltHex: string,
  ivHex: string
): Promise<string> {
  // 1. Check for fallback CBC ciphertext
  if (ciphertext.startsWith('cbc:')) {
    const rawCt = ciphertext.slice(4)
    const key = CryptoJS.PBKDF2(passphrase, CryptoJS.enc.Hex.parse(saltHex), {
      keySize: 256 / 32,
      iterations: 10000,
      hasher: CryptoJS.algo.SHA256
    })

    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: CryptoJS.enc.Hex.parse(rawCt) } as any,
      key,
      {
        iv: CryptoJS.enc.Hex.parse(ivHex),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      }
    )

    const result = decrypted.toString(CryptoJS.enc.Utf8)
    if (!result) {
      throw new Error('Decryption failed: incorrect passphrase or corrupted data')
    }
    return result
  }

  // 2. Standard WebCrypto AES-GCM
  const subtle = getSubtle()
  if (subtle) {
    const decoder = new TextDecoder()
    const salt = new Uint8Array(hexToBuffer(saltHex))
    const iv = new Uint8Array(hexToBuffer(ivHex))
    const encryptedBuffer = new Uint8Array(hexToBuffer(ciphertext))

    const key = await deriveKey(passphrase, salt)
    
    const decryptedBuffer = await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      encryptedBuffer
    )

    return decoder.decode(decryptedBuffer)
  }

  // 3. If SubtleCrypto is unavailable in browser but we received an AES-GCM payload,
  // Node.js crypto handles GCM if running on server; otherwise fail explicitly.
  try {
    const nodeCrypto = require('crypto')
    if (nodeCrypto.createDecipheriv) {
      const saltBuf = Buffer.from(saltHex, 'hex')
      const ivBuf = Buffer.from(ivHex, 'hex')
      const ctBuf = Buffer.from(ciphertext, 'hex')
      const keyBuf = nodeCrypto.pbkdf2Sync(passphrase, saltBuf, 100000, 32, 'sha256')
      const tag = ctBuf.subarray(ctBuf.length - 16)
      const actualCt = ctBuf.subarray(0, ctBuf.length - 16)
      const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', keyBuf, ivBuf)
      decipher.setAuthTag(tag)
      let dec = decipher.update(actualCt, undefined, 'utf8')
      dec += decipher.final('utf8')
      return dec
    }
  } catch {}

  throw new Error('SubtleCrypto is required to decrypt AES-GCM ciphertexts in this browser.')
}

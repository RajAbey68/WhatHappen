const getCrypto = (): Crypto => {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    return window.crypto
  }
  // Fallback for Node.js test environment
  return require('crypto').webcrypto as unknown as Crypto
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

// Derive a CryptoKey from a passphrase using PBKDF2
export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const crypto = getCrypto()
  const encoder = new TextEncoder()
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )

  return crypto.subtle.deriveKey(
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
}

// Encrypt plain text using a passphrase
export async function encryptText(
  text: string,
  passphrase: string,
  providedSalt?: Uint8Array
): Promise<{ ciphertext: string; iv: string; salt: string }> {
  const crypto = getCrypto()
  const encoder = new TextEncoder()
  
  // Use provided salt or generate a new random 16-byte salt
  const salt = providedSalt || crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12)) // AES-GCM recommended IV size is 12 bytes

  const key = await deriveKey(passphrase, salt)
  const encryptedBuffer = await crypto.subtle.encrypt(
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

// Decrypt ciphertext using a passphrase
export async function decryptText(
  ciphertext: string,
  passphrase: string,
  saltHex: string,
  ivHex: string
): Promise<string> {
  const crypto = getCrypto()
  const decoder = new TextDecoder()

  const salt = new Uint8Array(hexToBuffer(saltHex))
  const iv = new Uint8Array(hexToBuffer(ivHex))
  const encryptedBuffer = hexToBuffer(ciphertext)

  const key = await deriveKey(passphrase, salt)
  
  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    encryptedBuffer
  )

  return decoder.decode(decryptedBuffer)
}

import { decryptText } from '@/lib/crypto'

/** Trusted backend plaintext export. Keys come only from server configuration. */
export async function decryptArchiveField(value: unknown): Promise<string> {
  if (typeof value !== 'string') throw new Error('Invalid archive field')
  if (!value.trimStart().startsWith('{')) return value
  let envelope: any
  try { envelope = JSON.parse(value) } catch {
    if (/"(ciphertext|salt|iv)"\s*:/.test(value)) throw new Error('Malformed encrypted archive field')
    return value
  }
  if (!envelope || !['ciphertext', 'salt', 'iv'].some(key => key in envelope)) return value
  if (!['ciphertext', 'salt', 'iv'].every(key => typeof envelope[key] === 'string' && envelope[key])) {
    throw new Error('Malformed encrypted archive field')
  }
  const key = process.env.PROJECT_PASSPHRASE
  if (!key) throw new Error('Archive decryption is not configured')
  try { return await decryptText(envelope.ciphertext, key, envelope.salt, envelope.iv) }
  catch { throw new Error('Archive decryption failed') }
}

import { encryptText, decryptText, bufferToHex, hexToBuffer } from '../../lib/crypto'
import { TextEncoder, TextDecoder } from 'util'
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder as any

describe('Cryptographic Utilities', () => {
  const passphrase = 'my-super-secret-passphrase'
  const plainText = 'Hello, this is a highly sensitive message about project gravityclaw!'

  test('should encrypt and decrypt text successfully with correct passphrase', async () => {
    const { ciphertext, iv, salt } = await encryptText(plainText, passphrase)
    
    expect(ciphertext).toBeDefined()
    expect(iv).toBeDefined()
    expect(salt).toBeDefined()
    expect(ciphertext).not.toBe(plainText)

    const decrypted = await decryptText(ciphertext, passphrase, salt, iv)
    expect(decrypted).toBe(plainText)
  })

  test('should fail to decrypt with an incorrect passphrase', async () => {
    const { ciphertext, iv, salt } = await encryptText(plainText, passphrase)
    
    await expect(
      decryptText(ciphertext, 'wrong-passphrase', salt, iv)
    ).rejects.toThrow()
  })

  test('should generate different ciphertext for identical plain text (due to random salt/iv)', async () => {
    const res1 = await encryptText(plainText, passphrase)
    const res2 = await encryptText(plainText, passphrase)

    expect(res1.ciphertext).not.toBe(res2.ciphertext)
    expect(res1.iv).not.toBe(res2.iv)
    expect(res1.salt).not.toBe(res2.salt)

    // Both should decrypt to the same plain text
    const dec1 = await decryptText(res1.ciphertext, passphrase, res1.salt, res1.iv)
    const dec2 = await decryptText(res2.ciphertext, passphrase, res2.salt, res2.iv)

    expect(dec1).toBe(plainText)
    expect(dec2).toBe(plainText)
  })

  test('should convert ArrayBuffer to hex and back correctly', () => {
    const text = 'test'
    const encoder = new TextEncoder()
    const buffer = encoder.encode(text).buffer

    const hex = bufferToHex(buffer)
    const decodedBuffer = hexToBuffer(hex)
    const decoder = new TextDecoder()
    const decodedText = decoder.decode(decodedBuffer)

    expect(decodedText).toBe(text)
  })
})

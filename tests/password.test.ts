import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../server/password.js'

describe('password verifier', () => {
  it('uses a salted verifier and rejects an incorrect password', async () => {
    const encoded = await hashPassword('correct horse battery staple')
    expect(encoded.startsWith('scrypt$v1$')).toBe(true)
    expect(await verifyPassword('correct horse battery staple', encoded)).toBe(true)
    expect(await verifyPassword('wrong password', encoded)).toBe(false)
  })
})

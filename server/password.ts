import crypto from 'node:crypto'

const KEY_LENGTH = 64
const COST = 16384
const BLOCK_SIZE = 8
const PARALLELIZATION = 1

const deriveKey = (password: string, salt: Buffer, length: number) => new Promise<Buffer>((resolve, reject) => {
  crypto.scrypt(password, salt, length, { N: COST, r: BLOCK_SIZE, p: PARALLELIZATION }, (error, derived) => error ? reject(error) : resolve(derived as Buffer))
})

export const hashPassword = async (password: string) => {
  const salt = crypto.randomBytes(16)
  const derived = await deriveKey(password, salt, KEY_LENGTH)
  return `scrypt$v1$${salt.toString('base64url')}$${derived.toString('base64url')}`
}

export const verifyPassword = async (password: string, encoded: string) => {
  const [algorithm, version, saltEncoded, digestEncoded] = encoded.split('$')
  if (algorithm !== 'scrypt' || version !== 'v1' || !saltEncoded || !digestEncoded) return false
  try {
    const salt = Buffer.from(saltEncoded, 'base64url')
    const expected = Buffer.from(digestEncoded, 'base64url')
    const actual = await deriveKey(password, salt, expected.length)
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

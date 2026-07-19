import { SignJWT, jwtVerify } from 'jose'

function getJwtSecret(): Uint8Array {
  const val = process.env.JWT_SECRET
  if (!val) throw new Error('JWT_SECRET environment variable is required')
  return new TextEncoder().encode(val)
}

export interface CaptchaPayload {
  a: number
  b: number
  op: '+' | '*'
  ans: number
}

export async function createCaptchaToken(p: CaptchaPayload): Promise<string> {
  const secret = getJwtSecret()
  return new SignJWT({ a: p.a, b: p.b, op: p.op, ans: p.ans })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('10m')
    .sign(secret)
}

export async function verifyCaptchaToken(token: string, answer: number): Promise<boolean> {
  try {
    const secret = getJwtSecret()
    const { payload } = await jwtVerify(token, secret)
    const expected = Number(payload.ans)
    if (!Number.isFinite(expected)) return false
    return expected === Number(answer)
  } catch {
    return false
  }
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export async function generateCaptcha(): Promise<{ token: string; question: string }> {
  const op: '+' | '*' = Math.random() < 0.7 ? '+' : '*'
  const a = randomInt(1, 9)
  const b = randomInt(1, 9)
  const ans = op === '+' ? a + b : a * b
  const token = await createCaptchaToken({ a, b, op, ans })
  const symbol = op === '+' ? '+' : '×'
  return { token, question: `${a} ${symbol} ${b} = ?` }
}

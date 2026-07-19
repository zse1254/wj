import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import type { JWTPayload } from './types'
import { query } from './db'

function getJwtSecret(): Uint8Array {
  const val = process.env.JWT_SECRET
  if (!val) throw new Error('JWT_SECRET environment variable is required')
  return new TextEncoder().encode(val)
}

export async function createToken(payload: JWTPayload): Promise<string> {
  const secret = getJwtSecret()
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(secret)
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const secret = getJwtSecret()
    const { payload } = await jwtVerify(token, secret)
    return payload as unknown as JWTPayload
  } catch {
    return null
  }
}

export async function getAuthUser(): Promise<JWTPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) return null
  return verifyToken(token)
}

export async function requireAuth(): Promise<JWTPayload> {
  const user = await getAuthUser()
  if (!user) throw new Error('Unauthorized')
  return user
}

export async function requireAdmin(): Promise<JWTPayload> {
  const user = await requireAuth()
  if (!user.isAdmin) throw new Error('Forbidden')
  return user
}

export async function requireVip(): Promise<JWTPayload> {
  const user = await requireAuth()
  if (user.isAdmin) return user // 管理员等同 VIP 权限
  try {
    const rows = await query('SELECT is_vip, vip_expires_at FROM users WHERE id = ?', [user.userId])
    const u = rows[0]
    const isVip = Number(u?.is_vip) === 1
    const notExpired = !u?.vip_expires_at || new Date(u.vip_expires_at as string).getTime() > Date.now()
    if (isVip && notExpired) return user
  } catch {}
  throw new Error('Forbidden: VIP required')
}

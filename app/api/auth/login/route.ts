import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { query } from '@/lib/db'
import { createToken } from '@/lib/auth'

export async function GET() {
  return Response.json({ success: true, message: 'login route loaded' })
}

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json()
    if (!username || !password) {
      return Response.json({ success: false, error: 'Missing credentials' }, { status: 400 })
    }

    const users = await query(
      'SELECT id, username, email, password_hash, is_admin, is_vip, vip_expires_at FROM users WHERE username = ? OR email = ?',
      [username, username]
    )
    if (users.length === 0) {
      return Response.json({ success: false, error: 'Invalid credentials' }, { status: 401 })
    }

    const user = users[0]
    const valid = bcrypt.compareSync(password, user.password_hash as string)
    if (!valid) {
      return Response.json({ success: false, error: 'Invalid credentials' }, { status: 401 })
    }

    const token = await createToken({ userId: user.id as string, isAdmin: Boolean(user.is_admin) })
    const response = Response.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        isAdmin: Boolean(user.is_admin),
        isVip: Boolean(user.is_vip),
        vipExpiresAt: user.vip_expires_at,
      },
    })
    response.headers.set('Set-Cookie', `token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`)
    return response
  } catch (err) {
    return Response.json({ success: false, error: 'Server error', detail: String(err) }, { status: 500 })
  }
}

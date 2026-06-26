import { getAuthUser } from '@/lib/auth'
import { query } from '@/lib/db'

export async function GET() {
  try {
    const payload = await getAuthUser()
    if (!payload) {
      return Response.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }

    const users = await query(
      'SELECT id, username, email, is_admin, is_vip, vip_expires_at, created_at FROM users WHERE id = ?',
      [payload.userId]
    )
    if (users.length === 0) {
      return Response.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    const user = users[0]
    return Response.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        isAdmin: Boolean(user.is_admin),
        isVip: Boolean(user.is_vip),
        vipExpiresAt: user.vip_expires_at,
        createdAt: user.created_at,
      },
    })
  } catch {
    return Response.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const payload = await getAuthUser()
    if (!payload) {
      return Response.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    if (body.password) {
      const bcrypt = require('bcryptjs')
      const hash = bcrypt.hashSync(body.password, 10)
      const { execute } = await import('@/lib/db')
      await execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, payload.userId])
    }

    return Response.json({ success: true })
  } catch {
    return Response.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}

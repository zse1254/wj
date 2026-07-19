import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { query } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()
    const { searchParams } = request.nextUrl
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit

    const users = await query(
      'SELECT id, username, email, is_admin, is_vip, vip_expires_at, created_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    )
    const countResult = await query('SELECT COUNT(*) as total FROM users')
    const total = countResult[0]?.total as number || 0

    return Response.json({ success: true, data: { users, total, page, limit } })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAdmin()
    const { ids, action, vipDays } = await request.json()
    const list: string[] = Array.isArray(ids) ? ids : []
    if (list.length === 0) return Response.json({ success: false, error: '未选择用户' }, { status: 400 })
    const placeholders = list.map(() => '?').join(',')
    if (action === 'grant_vip') {
      const days = parseInt(vipDays, 10) || 365
      const until = new Date(Date.now() + days * 86400000).toISOString()
      await query(
        `UPDATE users SET is_vip = 1, vip_expires_at = ? WHERE id IN (${placeholders})`,
        [until, ...list]
      )
    } else if (action === 'revoke_vip') {
      await query(
        `UPDATE users SET is_vip = 0, vip_expires_at = NULL WHERE id IN (${placeholders})`,
        list
      )
    } else if (action === 'ban') {
      await query(`UPDATE users SET is_admin = 0, is_vip = 0 WHERE id IN (${placeholders})`, list)
    }
    return Response.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAdmin()
    const { ids } = await request.json()
    const list: string[] = Array.isArray(ids) ? ids : []
    if (list.length === 0) return Response.json({ success: false, error: '未选择用户' }, { status: 400 })
    const placeholders = list.map(() => '?').join(',')
    await query(`DELETE FROM favorites WHERE user_id IN (${placeholders})`, list)
    await query(`DELETE FROM users WHERE id IN (${placeholders}) AND is_admin = 0`, list)
    return Response.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

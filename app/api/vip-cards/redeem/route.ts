import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { query, execute } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const payload = await getAuthUser()
    if (!payload) {
      return Response.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }

    const { code } = await request.json()
    if (!code) {
      return Response.json({ success: false, error: 'Missing card code' }, { status: 400 })
    }

    const cards = await query('SELECT * FROM vip_cards WHERE code = ?', [code])
    if (cards.length === 0) {
      return Response.json({ success: false, error: 'Invalid card code' }, { status: 404 })
    }

    const card = cards[0]
    if (card.is_used) {
      return Response.json({ success: false, error: 'Card already used' }, { status: 400 })
    }

    const user = await query('SELECT is_vip, vip_expires_at FROM users WHERE id = ?', [payload.userId])
    if (user.length === 0) {
      return Response.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    const durationDays = card.duration_days as number
    const now = new Date()
    let expiresAt: Date

    if (user[0].is_vip && user[0].vip_expires_at) {
      expiresAt = new Date(user[0].vip_expires_at as string)
      if (expiresAt > now) {
        expiresAt.setDate(expiresAt.getDate() + durationDays)
      } else {
        expiresAt = new Date(now.getTime() + durationDays * 86400000)
      }
    } else {
      expiresAt = new Date(now.getTime() + durationDays * 86400000)
    }

    await execute('UPDATE vip_cards SET is_used = 1, used_by = ?, used_at = datetime("now") WHERE id = ?', [payload.userId, card.id])
    await execute('UPDATE users SET is_vip = 1, vip_expires_at = ? WHERE id = ?', [expiresAt.toISOString(), payload.userId])

    return Response.json({ success: true, data: { vipExpiresAt: expiresAt.toISOString() } })
  } catch {
    return Response.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}

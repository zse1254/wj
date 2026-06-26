import { NextRequest } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'
import { requireAdmin } from '@/lib/auth'
import { query, execute } from '@/lib/db'

export async function GET() {
  try {
    await requireAdmin()
    const cards = await query(
      `SELECT v.*, u.username as used_by_username
       FROM vip_cards v LEFT JOIN users u ON v.used_by = u.id
       ORDER BY v.created_at DESC`
    )
    return Response.json({ success: true, data: cards })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin()
    const { count = 1, durationDays = 30 } = await request.json()

    const cards: { id: string; code: string; durationDays: number }[] = []
    for (let i = 0; i < count; i++) {
      const id = uuidv4()
      const code = 'VIP' + crypto.randomBytes(8).toString('hex').toUpperCase()
      await execute(
        'INSERT INTO vip_cards (id, code, duration_days, created_by) VALUES (?, ?, ?, ?)',
        [id, code, durationDays, admin.userId]
      )
      cards.push({ id, code, durationDays })
    }

    return Response.json({ success: true, data: cards }, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

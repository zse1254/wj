import { NextRequest } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'
import { requireAdmin } from '@/lib/auth'
import { query, execute } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()
    const { searchParams } = request.nextUrl
    const mode = searchParams.get('mode') || 'all'
    const idsParam = searchParams.get('ids')
    let cards: Record<string, unknown>[]
    if (mode === 'used') {
      cards = await query(
        `SELECT v.*, u.username as used_by_username FROM vip_cards v
         LEFT JOIN users u ON v.used_by = u.id
         WHERE v.is_used = 1 ORDER BY v.created_at DESC`
      )
    } else if (idsParam) {
      const ids = idsParam.split(',').filter(Boolean)
      const placeholders = ids.map(() => '?').join(',')
      cards = await query(
        `SELECT v.*, u.username as used_by_username FROM vip_cards v
         LEFT JOIN users u ON v.used_by = u.id
         WHERE v.id IN (${placeholders}) ORDER BY v.created_at DESC`, ids
      )
    } else {
      cards = await query(
        `SELECT v.*, u.username as used_by_username FROM vip_cards v
         LEFT JOIN users u ON v.used_by = u.id
         ORDER BY v.created_at DESC`
      )
    }
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
    await execute('ALTER TABLE vip_cards ADD COLUMN note TEXT').catch(() => {})
    const { count = 1, durationDays = 30, note = '' } = await request.json()

    const cards: { id: string; code: string; durationDays: number }[] = []
    for (let i = 0; i < count; i++) {
      const id = uuidv4()
      const code = 'VIP' + crypto.randomBytes(8).toString('hex').toUpperCase()
      await execute(
        'INSERT INTO vip_cards (id, code, duration_days, created_by, note) VALUES (?, ?, ?, ?, ?)',
        [id, code, durationDays, admin.userId, note || null]
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

export async function DELETE(request: NextRequest) {
  try {
    await requireAdmin()
    const { mode } = await request.json()
    if (mode === 'used') {
      await execute('DELETE FROM vip_cards WHERE is_used = 1')
    }
    return Response.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

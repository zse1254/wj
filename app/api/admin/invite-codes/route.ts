import { NextRequest } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { requireAdmin } from '@/lib/auth'
import { query, execute } from '@/lib/db'

export async function GET() {
  try {
    await requireAdmin()
    const codes = await query(
      `SELECT c.*, u.username as created_by_username
       FROM invite_codes c LEFT JOIN users u ON c.created_by = u.id
       ORDER BY c.created_at DESC`
    )
    return Response.json({ success: true, data: codes })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin()
    const { count = 1, maxUses = 1, note = '', expiresAt = '' } = await request.json()
    const n = Math.min(Math.max(parseInt(count, 10) || 1, 1), 50)
    const mu = Math.min(Math.max(parseInt(maxUses, 10) || 1, 1), 100000)

    const created: { id: string; code: string }[] = []
    for (let i = 0; i < n; i++) {
      const id = uuidv4()
      const code = 'INV' + Math.random().toString(36).slice(2, 10).toUpperCase()
      await execute(
        'INSERT INTO invite_codes (id, code, max_uses, note, created_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, code, mu, note, admin.userId, expiresAt || null]
      )
      created.push({ id, code })
    }
    return Response.json({ success: true, data: created }, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAdmin()
    const { id, enabled, maxUses } = await request.json()
    if (!id) return Response.json({ success: false, error: '缺少 id' }, { status: 400 })
    if (typeof enabled === 'number' || typeof enabled === 'boolean') {
      await execute('UPDATE invite_codes SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, id])
    }
    if (typeof maxUses === 'number' && maxUses > 0) {
      await execute('UPDATE invite_codes SET max_uses = ? WHERE id = ?', [maxUses, id])
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
    const { id } = await request.json()
    if (!id) return Response.json({ success: false, error: '缺少 id' }, { status: 400 })
    await execute('DELETE FROM invite_codes WHERE id = ?', [id])
    return Response.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

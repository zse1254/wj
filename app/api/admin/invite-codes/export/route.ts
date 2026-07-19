import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { query, execute } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    const { ids } = await request.json().catch(() => ({ ids: null }))
    let rows: Record<string, unknown>[] = []
    if (Array.isArray(ids) && ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',')
      rows = await query(`SELECT * FROM invite_codes WHERE id IN (${placeholders})`, ids)
    } else {
      rows = await query('SELECT * FROM invite_codes ORDER BY created_at DESC')
    }
    const csv = [
      'code,max_uses,used_count,status,note,expires_at,created_at',
      ...rows.map((c: any) => [
        c.code, c.max_uses, c.used_count,
        c.enabled ? '启用' : '禁用', c.note || '', c.expires_at || '', c.created_at,
      ].join(',')),
    ].join('\n')
    return Response.json({ success: true, csv: '﻿' + csv })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAdmin()
    await execute('DELETE FROM invite_codes WHERE used_count >= max_uses')
    return Response.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

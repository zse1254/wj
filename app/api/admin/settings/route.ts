import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { query, execute } from '@/lib/db'

export async function GET() {
  try {
    await requireAdmin()
    const rows = await query('SELECT key, value FROM settings')
    const data: Record<string, string> = {}
    for (const r of rows) data[String(r.key)] = String(r.value ?? '')
    return Response.json({ success: true, data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    const { key, value } = await request.json()
    if (!key) return Response.json({ success: false, error: '缺少 key' }, { status: 400 })
    await execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, String(value)])
    return Response.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

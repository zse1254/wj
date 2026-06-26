import { NextRequest } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { requireAdmin } from '@/lib/auth'
import { query, execute } from '@/lib/db'

export async function GET() {
  try {
    await requireAdmin()
    const categories = await query('SELECT * FROM categories ORDER BY name')
    return Response.json({ success: true, data: categories })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    const { name, slug } = await request.json()
    if (!name || !slug) {
      return Response.json({ success: false, error: 'Name and slug required' }, { status: 400 })
    }
    const id = uuidv4()
    await execute('INSERT INTO categories (id, name, slug) VALUES (?, ?, ?)', [id, name, slug])
    return Response.json({ success: true, data: { id } }, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAdmin()
    const { searchParams } = request.nextUrl
    const id = searchParams.get('id')
    if (!id) return Response.json({ success: false, error: 'Missing id' }, { status: 400 })
    await execute('DELETE FROM categories WHERE id = ?', [id])
    return Response.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

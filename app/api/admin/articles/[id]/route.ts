import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { query, execute } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  context: RouteContext<'/api/admin/articles/[id]'>
) {
  try {
    await requireAdmin()
    const { id } = await context.params
    const articles = await query(
      `SELECT a.*, c.name as category_name
       FROM articles a LEFT JOIN categories c ON a.category_id = c.id
       WHERE a.id = ?`,
      [id]
    )
    if (articles.length === 0) {
      return Response.json({ success: false, error: 'Not found' }, { status: 404 })
    }
    return Response.json({ success: true, data: articles[0] })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

export async function PUT(
  request: NextRequest,
  context: RouteContext<'/api/admin/articles/[id]'>
) {
  try {
    await requireAdmin()
    const { id } = await context.params
    const body = await request.json()

    await execute(
      `UPDATE articles SET title=?, content=?, summary=?, cover_image=?, type=?, video_url=?, audio_url=?, bilibili_url=?, is_m3u8=?, category_id=?, published=?, updated_at=datetime('now')
       WHERE id=?`,
      [
        body.title, body.content || '', body.summary || '', body.cover_image || null,
        body.type, body.video_url || null, body.audio_url || null, body.bilibili_url || null,
        body.is_m3u8 ? 1 : 0, body.category_id || null, body.published ? 1 : 0, id,
      ]
    )

    return Response.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<'/api/admin/articles/[id]'>
) {
  try {
    await requireAdmin()
    const { id } = await context.params
    await execute('DELETE FROM articles WHERE id = ?', [id])
    return Response.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

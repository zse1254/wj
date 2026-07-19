import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { query, execute } from '@/lib/db'

export async function GET() {
  try {
    await requireAdmin()
    const memberRows = await query(
      `SELECT r.id as report_id, r.reason, r.created_at as report_at,
              p.id as post_id, p.title as post_title, p.bilibili_url, p.user_id as author_id,
              u.username as owner_username, 'member_post' as source
       FROM member_reports r
       JOIN member_posts p ON r.post_id = p.id
       LEFT JOIN users u ON p.user_id = u.id
       ORDER BY r.created_at DESC`
    )
    let articleRows: Record<string, unknown>[] = []
    try {
      articleRows = await query(
        `SELECT r.id as report_id, r.reason, r.created_at as report_at,
                a.id as post_id, a.title as post_title, a.bilibili_url, a.author_id,
                u.username as owner_username, 'article' as source
         FROM article_reports r
         JOIN articles a ON r.article_id = a.id
         LEFT JOIN users u ON a.author_id = u.id
         ORDER BY r.created_at DESC`
      )
    } catch {}
    const rows = [...memberRows, ...articleRows].sort((a, b) => {
      const da = a.report_at as string || ''
      const db = b.report_at as string || ''
      return db.localeCompare(da)
    })
    return Response.json({ success: true, data: rows })
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
    const postId = searchParams.get('postId')
    const reportId = searchParams.get('id')
    const source = searchParams.get('source') || 'member_post'
    if (postId) {
      if (source === 'article') {
        await execute('DELETE FROM articles WHERE id = ?', [postId])
      } else {
        await execute('DELETE FROM member_posts WHERE id = ?', [postId])
      }
      return Response.json({ success: true })
    }
    if (reportId) {
      if (source === 'article') {
        await execute('DELETE FROM article_reports WHERE id = ?', [reportId])
      } else {
        await execute('DELETE FROM member_reports WHERE id = ?', [reportId])
      }
      return Response.json({ success: true })
    }
    return Response.json({ success: false, error: 'Missing param' }, { status: 400 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

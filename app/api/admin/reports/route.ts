import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { query, execute } from '@/lib/db'

export async function GET() {
  try {
    await requireAdmin()
    const rows = await query(
      `SELECT r.id as report_id, r.reason, r.created_at as report_at,
              p.id as post_id, p.title as post_title, p.bilibili_url, p.user_id as author_id,
              u.username as owner_username
       FROM member_reports r
       JOIN member_posts p ON r.post_id = p.id
       LEFT JOIN users u ON p.user_id = u.id
       ORDER BY r.created_at DESC`
    )
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
    if (postId) {
      // 删除帖子（管理员），举报记录随外键级联删除
      await execute('DELETE FROM member_posts WHERE id = ?', [postId])
      return Response.json({ success: true })
    }
    if (reportId) {
      await execute('DELETE FROM member_reports WHERE id = ?', [reportId])
      return Response.json({ success: true })
    }
    return Response.json({ success: false, error: 'Missing param' }, { status: 400 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

import { NextRequest } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth } from '@/lib/auth'
import { query, execute } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const { postId, reason } = await request.json()
    if (!postId) return Response.json({ success: false, error: 'Missing postId' }, { status: 400 })
    const posts = await query('SELECT id FROM member_posts WHERE id = ?', [postId])
    if (posts.length === 0) return Response.json({ success: false, error: '内容不存在' }, { status: 404 })

    const id = uuidv4()
    await execute(
      'INSERT INTO member_reports (id, post_id, reporter_id, reason) VALUES (?, ?, ?, ?)',
      [id, postId, user.userId, (reason || '').toString().slice(0, 500)]
    )
    return Response.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

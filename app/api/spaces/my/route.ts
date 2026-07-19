import { requireAuth } from '@/lib/auth'
import { query } from '@/lib/db'

export async function GET() {
  try {
    const user = await requireAuth()
    const spaces = await query('SELECT * FROM member_spaces WHERE user_id = ?', [user.userId])
    if (spaces.length === 0) {
      return Response.json({ success: true, data: null })
    }
    const space = spaces[0]
    const posts = await query(
      'SELECT * FROM member_posts WHERE space_id = ? ORDER BY created_at DESC',
      [space.id]
    )
    return Response.json({ success: true, data: { space, posts } })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

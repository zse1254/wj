import { getAuthUser } from '@/lib/auth'
import { query } from '@/lib/db'

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params
    const spaces = await query(
      `SELECT s.*, u.username as owner_username
       FROM member_spaces s JOIN users u ON s.user_id = u.id
       WHERE s.slug = ?`,
      [slug]
    )
    if (spaces.length === 0) {
      return Response.json({ success: false, error: '空间不存在' }, { status: 404 })
    }
    const space = spaces[0]
    const viewer = await getAuthUser()
    const isOwner = viewer && viewer.userId === space.user_id

    if (space.is_public !== 1 && !isOwner) {
      return Response.json({ success: false, error: '该空间未公开' }, { status: 403 })
    }

    const posts = await query(
      'SELECT id, bvid, title, cover_image, duration, created_at FROM member_posts WHERE space_id = ? ORDER BY created_at DESC',
      [space.id]
    )
    return Response.json({ success: true, data: { space, posts } })
  } catch {
    return Response.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}

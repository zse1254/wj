import { NextRequest } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth, requireVip, getAuthUser } from '@/lib/auth'
import { query, execute } from '@/lib/db'
import { isValidSlug } from '@/lib/member'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    if (searchParams.get('latest')) {
      const limit = Math.min(parseInt(searchParams.get('limit') || '12'), 24)
      const posts = await query(
        `SELECT p.id, p.bvid, p.title, p.cover_image, p.duration, p.bilibili_url,
                s.slug as space_slug, s.display_name as space_name, u.username as owner_username
         FROM member_posts p
         JOIN member_spaces s ON p.space_id = s.id
         JOIN users u ON s.user_id = u.id
         WHERE s.is_public = 1
         ORDER BY p.created_at DESC LIMIT ?`,
        [limit]
      )
      return Response.json({ success: true, data: posts })
    }
    const spaces = await query(
      `SELECT s.id, s.slug, s.display_name, s.is_public, u.username as owner_username,
              (SELECT COUNT(*) FROM member_posts p WHERE p.space_id = s.id) as post_count
       FROM member_spaces s JOIN users u ON s.user_id = u.id
       WHERE s.is_public = 1
       ORDER BY s.created_at DESC`
    )
    return Response.json({ success: true, data: spaces })
  } catch {
    return Response.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireVip()
    const body = await request.json()
    const slug = String(body.slug || '').trim()
    const displayName = String(body.display_name || '').trim()
    const isPublic = body.is_public === false ? 0 : 1

    if (!isValidSlug(slug)) {
      return Response.json({ success: false, error: '后缀只能为2-30位字母、数字、下划线或中文' }, { status: 400 })
    }
    if (!displayName) {
      return Response.json({ success: false, error: '请填写空间名称' }, { status: 400 })
    }

    // Only one space per user
    const existing = await query('SELECT id, slug FROM member_spaces WHERE user_id = ?', [user.userId])
    if (existing.length > 0 && existing[0].slug !== slug) {
      const dup = await query('SELECT id FROM member_spaces WHERE slug = ? AND user_id != ?', [slug, user.userId])
      if (dup.length > 0) {
        return Response.json({ success: false, error: '该后缀已被占用，请换一个' }, { status: 409 })
      }
      await execute('UPDATE member_spaces SET slug = ?, display_name = ?, is_public = ? WHERE id = ?',
        [slug, displayName, isPublic, existing[0].id])
      return Response.json({ success: true, data: { slug } })
    }
    if (existing.length > 0) {
      await execute('UPDATE member_spaces SET display_name = ?, is_public = ? WHERE id = ?',
        [displayName, isPublic, existing[0].id])
      return Response.json({ success: true, data: { slug: existing[0].slug } })
    }

    const dup = await query('SELECT id FROM member_spaces WHERE slug = ?', [slug])
    if (dup.length > 0) {
      return Response.json({ success: false, error: '该后缀已被占用，请换一个' }, { status: 409 })
    }

    const id = uuidv4()
    await execute(
      'INSERT INTO member_spaces (id, user_id, slug, display_name, is_public) VALUES (?, ?, ?, ?, ?)',
      [id, user.userId, slug, displayName, isPublic]
    )
    return Response.json({ success: true, data: { slug } }, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : msg.startsWith('Forbidden') ? 403 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

import { NextRequest } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { requireVip } from '@/lib/auth'
import { query, execute } from '@/lib/db'
import { isValidBilibiliUrl, fetchBilibiliMeta } from '@/lib/member'

async function getQuota(): Promise<number> {
  const rows = await query("SELECT value FROM settings WHERE key = 'member_quota'")
  const v = parseInt(String(rows[0]?.value ?? ''), 10)
  return Number.isFinite(v) && v > 0 ? v : 10
}

async function getOrCreateSpace(userId: string): Promise<string | null> {
  const spaces = await query('SELECT id FROM member_spaces WHERE user_id = ?', [userId])
  if (spaces.length > 0) return spaces[0].id as string
  return null
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireVip()
    const body = await request.json()
    const url = String(body.url || '').trim()

    if (!isValidBilibiliUrl(url)) {
      return Response.json({ success: false, error: '仅支持 Bilibili 链接（bilibili.com / b23.tv）' }, { status: 400 })
    }

    const spaceId = await getOrCreateSpace(user.userId)
    if (!spaceId) {
      return Response.json({ success: false, error: '请先在「我的空间」创建空间' }, { status: 400 })
    }

    const quota = await getQuota()
    const countRows = await query('SELECT COUNT(*) as c FROM member_posts WHERE space_id = ?', [spaceId])
    const used = Number(countRows[0]?.c || 0)
    if (used >= quota) {
      return Response.json({ success: false, error: `已达上限（${quota} 条），如需更多请联系管理员` }, { status: 403 })
    }

    const meta = await fetchBilibiliMeta(url)
    if (!meta) {
      return Response.json({ success: false, error: '无法获取该 B 站视频信息，请检查链接' }, { status: 502 })
    }

    const id = uuidv4()
    await execute(
      'INSERT INTO member_posts (id, space_id, user_id, bilibili_url, bvid, type, title, cover_image, duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, spaceId, user.userId, url, meta.bvid, 'video', meta.title, meta.cover, meta.duration]
    )
    return Response.json({ success: true, data: { id } }, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireVip()
    const { id } = await request.json()
    if (!id) return Response.json({ success: false, error: 'Missing id' }, { status: 400 })
    // Only allow deleting own post (admin could be added later)
    await execute('DELETE FROM member_posts WHERE id = ? AND user_id = ?', [id, user.userId])
    return Response.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : msg.startsWith('Forbidden') ? 403 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

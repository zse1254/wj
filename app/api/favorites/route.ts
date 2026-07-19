import { NextRequest } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { query, execute } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'

async function ensureTable() {
  await execute('CREATE TABLE IF NOT EXISTS favorites (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, item_type TEXT NOT NULL, item_id TEXT NOT NULL, created_at TEXT DEFAULT (datetime(\'now\')), FOREIGN KEY (user_id) REFERENCES users(id), UNIQUE (user_id, item_type, item_id))')
}

async function getLimit(): Promise<number> {
  const r = await query("SELECT value FROM settings WHERE key = 'max_favorites'")
  const n = r.length > 0 ? parseInt(String(r[0].value), 10) : 10
  return Number.isFinite(n) && n > 0 ? n : 10
}

async function getItemTitle(type: string, id: string): Promise<{ title: string; cover_image: string } | null> {
  const tableMap: Record<string, string> = {
    article: 'articles', video: 'articles', audio: 'articles', series: 'articles',
  }
  const tbl = tableMap[type]
  if (!tbl) return null
  const rows = await query(`SELECT title, cover_image FROM ${tbl} WHERE id = ?`, [id])
  if (rows.length === 0) return null
  return { title: String(rows[0].title || ''), cover_image: String(rows[0].cover_image || '') }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const url = new URL(request.url)
    const type = url.searchParams.get('type')
    const id = url.searchParams.get('id')

    if (type && id) {
      const rows = await query(
        'SELECT id FROM favorites WHERE user_id = ? AND item_type = ? AND item_id = ?',
        [user.userId, type, id]
      )
      return Response.json({ success: true, favorited: rows.length > 0 })
    }

    const list = await query(
      'SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC',
      [user.userId]
    )
    const enriched = await Promise.all(list.map(async (f: any) => {
      const info = await getItemTitle(f.item_type, f.item_id)
      return {
        id: f.id,
        itemType: f.item_type,
        itemId: f.item_id,
        title: info?.title || '已删除的内容',
        coverImage: info?.cover_image || '',
        createdAt: f.created_at,
      }
    }))
    return Response.json({ success: true, data: enriched })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    await ensureTable()
    const { type, id } = await request.json()
    if (!type || !id) return Response.json({ success: false, error: '缺少参数' }, { status: 400 })

    const existing = await query(
      'SELECT id FROM favorites WHERE user_id = ? AND item_type = ? AND item_id = ?',
      [user.userId, type, id]
    )
    if (existing.length > 0) {
      return Response.json({ success: true, message: '已收藏' })
    }

    const limit = await getLimit()
    const count = await query('SELECT COUNT(*) as c FROM favorites WHERE user_id = ?', [user.userId])
    const c = count.length > 0 ? Number(count[0].c) : 0
    if (c >= limit) {
      return Response.json({ success: false, error: `收藏已达上限（${limit} 个）` }, { status: 400 })
    }

    await execute(
      'INSERT INTO favorites (id, user_id, item_type, item_id) VALUES (?, ?, ?, ?)',
      [uuidv4(), user.userId, type, id]
    )
    return Response.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    const { type, id } = await request.json()
    if (!type || !id) return Response.json({ success: false, error: '缺少参数' }, { status: 400 })
    await execute(
      'DELETE FROM favorites WHERE user_id = ? AND item_type = ? AND item_id = ?',
      [user.userId, type, id]
    )
    return Response.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}

import { NextRequest } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { requireAdmin } from '@/lib/auth'
import { query, execute } from '@/lib/db'

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^\w\u4e00-\u9fff]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'post'
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin()
    const { searchParams } = request.nextUrl
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const type = searchParams.get('type')
    const offset = (page - 1) * limit

    let where = ''
    const whereParams: unknown[] = []
    if (type) {
      where = ' WHERE a.type = ?'
      whereParams.push(type)
    }

    const articles = await query(
      `SELECT a.*, c.name as category_name, u.username as author_name
       FROM articles a
       LEFT JOIN categories c ON a.category_id = c.id
       LEFT JOIN users u ON a.author_id = u.id
       ${where}
       ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
      [...whereParams, limit, offset]
    )
    const countResult = await query('SELECT COUNT(*) as total FROM articles')
    const total = countResult[0]?.total as number || 0

    return Response.json({ success: true, data: { articles, total, page, limit } })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

async function ensureColumns() {
  const d1 = (globalThis as any)[Symbol.for('__cloudflare-context__')]?.env?.DB || (process as any).env?.DB
  if (!d1) return
  for (const sql of [
    "ALTER TABLE articles ADD COLUMN cover_image TEXT",
    "ALTER TABLE articles ADD COLUMN video_url TEXT",
    "ALTER TABLE articles ADD COLUMN is_m3u8 INTEGER DEFAULT 0",
    "ALTER TABLE articles ADD COLUMN published INTEGER DEFAULT 0",
    "ALTER TABLE articles ADD COLUMN author_id TEXT",
    "ALTER TABLE articles ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))",
  ]) {
    try { await d1.prepare(sql).all() } catch {}
  }
}

async function syncCategories(articleId: string, categoryIds: unknown) {
  await execute('DELETE FROM article_categories WHERE article_id = ?', [articleId])
  if (Array.isArray(categoryIds)) {
    for (const cid of categoryIds) {
      if (typeof cid === 'string' && cid) {
        await execute('INSERT OR IGNORE INTO article_categories (article_id, category_id) VALUES (?, ?)', [articleId, cid])
      }
    }
  }
}

async function ensureSeriesContent(body: any) {
  if (body.type !== 'series') return body
  if (body.content && typeof body.content === 'string') {
    try {
      const parsed = JSON.parse(body.content)
      if (Array.isArray(parsed.videos) && parsed.videos.length > 0) return body
    } catch {}
  }
  // content 为空或无效 → 尝试通过 bilibili_url 重建
  const url = body.bilibili_url
  if (!url) return body
  try {
    const res = await fetch('https://rustic-mayfly-8854.zse1254.deno.net', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json()
    if (data.success && Array.isArray(data.data?.series?.videos) && data.data.series.videos.length > 0) {
      const videos = data.data.series.videos.map((v: any) => ({ bvid: v.bvid, title: v.title, cover_url: v.cover_url, page: v.page, duration: v.duration }))
      body.content = JSON.stringify({ videos })
    }
  } catch {}
  return body
}

async function doInsert(body: any, admin: any, id: string) {
  const slug = `${slugify(body.title)}-${Date.now()}`
  await execute(
    `INSERT INTO articles (id, title, slug, content, summary, cover_image, type, video_url, audio_url, bilibili_url, is_m3u8, category_id, published, author_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, body.title, slug, body.content || '', body.summary || '', body.cover_image || null,
      body.type, body.video_url || null, body.audio_url || null, body.bilibili_url || null,
      body.is_m3u8 ? 1 : 0, body.category_id || null, body.published ? 1 : 0, admin.userId,
    ]
  )
  await syncCategories(id, body.category_ids)
}

export async function POST(request: NextRequest) {
  let body: any, id: string, admin: any
  try {
    await ensureColumns()
    admin = await requireAdmin()
    body = await request.json()

    if (!body.title || !body.type) {
      return Response.json({ success: false, error: 'Title and type are required' }, { status: 400 })
    }

    body = await ensureSeriesContent(body)
    id = uuidv4()
    await doInsert(body, admin, id)

    return Response.json({ success: true, data: { id } }, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    if (msg?.includes('has no column named')) {
      try {
        await ensureColumns()
        id = uuidv4()
        const d1 = (globalThis as any)[Symbol.for('__cloudflare-context__')]?.env?.DB || (process as any).env?.DB
        if (d1) {
          await doInsert(body || {}, admin || { userId: '' }, id)
          return Response.json({ success: true, data: { id } }, { status: 201 })
        }
      } catch {}
    }
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

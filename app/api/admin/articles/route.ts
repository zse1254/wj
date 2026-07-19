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
    const offset = (page - 1) * limit

    const articles = await query(
      `SELECT a.*, c.name as category_name, u.username as author_name
       FROM articles a
       LEFT JOIN categories c ON a.category_id = c.id
       LEFT JOIN users u ON a.author_id = u.id
       ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
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

export async function POST(request: NextRequest) {
  let body: any, id: string, admin: any
  try {
    await ensureColumns()
    admin = await requireAdmin()
    body = await request.json()

    if (!body.title || !body.type) {
      return Response.json({ success: false, error: 'Title and type are required' }, { status: 400 })
    }

    id = uuidv4()
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

    return Response.json({ success: true, data: { id } }, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    // Auto-migrate + retry as last resort
    if (msg?.includes('has no column named')) {
      try {
        await ensureColumns()
        id = uuidv4()
        const retrySlug = `${slugify(body?.title || 'post')}-${Date.now()}`
        const d1 = (globalThis as any)[Symbol.for('__cloudflare-context__')]?.env?.DB || (process as any).env?.DB
        if (d1) {
          await d1.prepare(
            `INSERT INTO articles (id, title, slug, content, summary, cover_image, type, video_url, audio_url, bilibili_url, is_m3u8, category_id, published, author_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            id, body?.title || '', retrySlug, body?.content || '', body?.summary || '', body?.cover_image || null,
            body?.type || 'video', body?.video_url || null, body?.audio_url || null, body?.bilibili_url || null,
            body?.is_m3u8 ? 1 : 0, body?.category_id || null, body?.published ? 1 : 0, admin?.userId || '',
           ).all()
          await syncCategories(id, body?.category_ids)
          return Response.json({ success: true, data: { id } }, { status: 201 })
        }
      } catch {}
    }
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

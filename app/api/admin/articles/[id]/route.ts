import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { query, execute } from '@/lib/db'
import { extractBilibiliBvid } from '@/lib/bilibili'
import { fetchPlayurl } from '@/lib/deno-proxy'

export async function GET(
  _request: NextRequest,
  context: RouteContext<'/api/admin/articles/[id]'>
) {
  try {
    await requireAdmin()
    const { id } = await context.params
    const articles = await query(
      `SELECT a.*, c.name as category_name
       FROM articles a LEFT JOIN categories c ON a.category_id = c.id
       WHERE a.id = ?`,
      [id]
    )
    if (articles.length === 0) {
      return Response.json({ success: false, error: 'Not found' }, { status: 404 })
    }
    const article = articles[0]
    let category_ids: string[] = []
    try {
      const catRows = await query('SELECT category_id FROM article_categories WHERE article_id = ?', [id])
      category_ids = catRows.map((r: any) => r.category_id)
    } catch {
      try {
        await execute('CREATE TABLE IF NOT EXISTS article_categories (article_id TEXT, category_id TEXT, PRIMARY KEY (article_id, category_id))', [])
      } catch {}
    }
    article.category_ids = category_ids
    return Response.json({ success: true, data: article })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

async function fetchAndStoreStream(articleId: string, bilibiliUrl: string) {
  const bvid = extractBilibiliBvid(bilibiliUrl)
  if (!bvid) return
  try {
    const data = await fetchPlayurl(bvid, undefined, 80)
    if (data?.dash) {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      await execute('UPDATE articles SET stream_data = ?, stream_expires_at = ? WHERE id = ?', [
        JSON.stringify(data), expiresAt, articleId,
      ])
    }
  } catch {}
}

async function ensureSeriesContent(body: any) {
  if (body.type !== 'series') return body
  if (body.content && typeof body.content === 'string') {
    try {
      const parsed = JSON.parse(body.content)
      if (Array.isArray(parsed.videos) && parsed.videos.length > 0) return body
    } catch {}
  }
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

export async function PUT(
  request: NextRequest,
  context: RouteContext<'/api/admin/articles/[id]'>
) {
  try {
    await requireAdmin()
    const { id } = await context.params
    let body = await request.json()
    body = await ensureSeriesContent(body)

    await execute(
      `UPDATE articles SET title=?, content=?, summary=?, cover_image=?, type=?, video_url=?, audio_url=?, bilibili_url=?, is_m3u8=?, category_id=?, published=?, updated_at=datetime('now')
       WHERE id=?`,
      [
        body.title, body.content || '', body.summary || '', body.cover_image || null,
        body.type, body.video_url || null, body.audio_url || null, body.bilibili_url || null,
        body.is_m3u8 ? 1 : 0, body.category_id || null, body.published ? 1 : 0, id,
      ]
    )

    if ('category_ids' in body) {
      try {
        await execute('CREATE TABLE IF NOT EXISTS article_categories (article_id TEXT, category_id TEXT, PRIMARY KEY (article_id, category_id))', [])
        await execute('DELETE FROM article_categories WHERE article_id = ?', [id])
        if (Array.isArray(body.category_ids)) {
          for (const cid of body.category_ids) {
            if (typeof cid === 'string' && cid) {
              await execute('INSERT OR IGNORE INTO article_categories (article_id, category_id) VALUES (?, ?)', [id, cid])
            }
          }
        }
      } catch {}
    }

    // 直链解析(playurl)已停用: 播放走官方极简播放器, 不再调用 Deno 解析, 省额度
    return Response.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<'/api/admin/articles/[id]'>
) {
  try {
    await requireAdmin()
    const { id } = await context.params
    await execute('DELETE FROM articles WHERE id = ?', [id])
    return Response.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500
    return Response.json({ success: false, error: msg }, { status })
  }
}

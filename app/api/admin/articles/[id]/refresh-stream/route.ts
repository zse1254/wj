import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { query, execute } from '@/lib/db'
import { extractBilibiliBvid } from '@/lib/bilibili'
import { fetchPlayurl } from '@/lib/deno-proxy'

export async function POST(
  _request: NextRequest,
  context: any
) {
  try {
    await requireAdmin()
    const { id } = await context.params

    let articles: any[] = await query('SELECT bilibili_url FROM articles WHERE id = ?', [id]).catch(() => [])
    if (!articles.length) {
      try { await query("ALTER TABLE articles ADD COLUMN stream_data TEXT", []) } catch {}
      try { await query("ALTER TABLE articles ADD COLUMN stream_expires_at TEXT", []) } catch {}
      const retry = await query('SELECT bilibili_url FROM articles WHERE id = ?', [id])
      if (!retry.length) return Response.json({ success: false, error: 'Not found' }, { status: 404 })
      articles = retry
    }
    const bilibiliUrl = (articles[articles.length - 1] as any).bilibili_url
    if (!bilibiliUrl) return Response.json({ success: false, error: 'No bilibili URL' }, { status: 400 })

    const bvid = extractBilibiliBvid(bilibiliUrl)
    if (!bvid) return Response.json({ success: false, error: 'Invalid bilibili URL' }, { status: 400 })

    try {
      const data = await fetchPlayurl(bvid, undefined, 80)
      if (!data?.dash) throw new Error('no dash')

      let expiresAt = new Date(Date.now() + 50 * 60 * 1000).toISOString()
      try {
        const bu = data.dash.video?.[0]?.baseUrl || data.dash.video?.[0]?.base_url || ''
        if (bu) {
          const dl = new URL(bu).searchParams.get('deadline')
          if (dl) {
            const dlMs = Number(dl) * 1000
            if (dlMs > Date.now()) expiresAt = new Date(dlMs - 5 * 60 * 1000).toISOString()
          }
        }
      } catch {}

      await execute('UPDATE articles SET stream_data = ?, stream_expires_at = ? WHERE id = ?', [
        JSON.stringify(data), expiresAt, id,
      ])
      return Response.json({ success: true, message: '直链已刷新' })
    } catch (e: any) {
      return Response.json({ success: false, error: e?.message || '内部错误' }, { status: 502 })
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}
import { NextRequest } from 'next/server'
import { query, execute } from '@/lib/db'
import { extractBilibiliBvid } from '@/lib/bilibili'
import { DENO_PROXIES } from '@/lib/deno-proxy'

export async function POST(
  _request: NextRequest,
  context: any
) {
  try {
    const { id } = await context.params

    let articles: any[] = await query('SELECT bilibili_url FROM articles WHERE id = ? AND published = 1', [id]).catch(() => [])
    if (!articles.length) {
      try { await execute("ALTER TABLE articles ADD COLUMN stream_data TEXT", []) } catch {}
      try { await execute("ALTER TABLE articles ADD COLUMN stream_expires_at TEXT", []) } catch {}
      const retry = await query('SELECT bilibili_url FROM articles WHERE id = ? AND published = 1', [id])
      if (!retry.length) return Response.json({ success: false, error: 'Not found' }, { status: 404 })
      articles = retry
    }
    const bilibiliUrl = (articles[0] as any).bilibili_url
    if (!bilibiliUrl) {
      return Response.json({ success: false, error: 'No bilibili URL' }, { status: 400 })
    }

    const bvid = extractBilibiliBvid(bilibiliUrl)
    if (!bvid) {
      return Response.json({ success: false, error: 'Invalid bilibili URL' }, { status: 400 })
    }

    let success = false
    const errors: string[] = []
    for (const proxyUrl of DENO_PROXIES) {
      try {
        const res = await fetch(proxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'playurl', bvid, qn: 80 }),
          signal: AbortSignal.timeout(10000),
        })
        const text = await res.text()
        let data: any = {}
        try { data = JSON.parse(text) } catch { data = { error: text } }
        if (!res.ok || !data.success) {
          errors.push(`${proxyUrl}: ${data.error || `HTTP ${res.status}`}`)
          continue
        }

        let expiresAt = new Date(Date.now() + 50 * 60 * 1000).toISOString()
        try {
          const firstV = data.data?.dash?.video?.[0]
          const bu = firstV?.base_url || firstV?.baseUrl || ''
          if (bu) {
            const dl = new URL(bu).searchParams.get('deadline')
            if (dl) {
              const dlMs = Number(dl) * 1000
              if (dlMs > Date.now()) {
                expiresAt = new Date(dlMs - 5 * 60 * 1000).toISOString()
              }
            }
          }
        } catch {}

        await execute('UPDATE articles SET stream_data = ?, stream_expires_at = ? WHERE id = ?', [
          JSON.stringify(data.data), expiresAt, id,
        ])
        success = true
        break
      } catch (e: any) {
        errors.push(`${proxyUrl}: ${e?.message || e}`)
      }
    }

    if (success) {
      return Response.json({ success: true, message: '直链已刷新' })
    }
    return Response.json({ success: false, error: '所有代理失败: ' + errors.join(' | ') }, { status: 502 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}
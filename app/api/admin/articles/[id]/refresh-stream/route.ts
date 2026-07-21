import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { query, execute } from '@/lib/db'
import { extractBilibiliBvid } from '@/lib/bilibili'
import { DENO_PROXIES } from '@/lib/deno-proxy'

function withTimeout(promise: Promise<any>, ms: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) }
    )
  })
}

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
        console.error('[refresh-stream] trying proxy:', proxyUrl)
        const res = await withTimeout(
          fetch(proxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'playurl', bvid, qn: 120 }),
          }),
          10000
        )
        const text = await res.text()
        let data: any = {}
        try { data = JSON.parse(text) } catch { data = { error: text } }
        if (!res.ok) {
          errors.push(`${proxyUrl}: HTTP ${res.status}`)
          continue
        }
        if (!data.success) {
          errors.push(`${proxyUrl}: ${data.error || 'unknown'}`)
          continue
        }
        // B站 给的 base_url 含 deadline query,实际有效期约 1 小时
        // 从第一个 video base_url 抽出 deadline,留 5 分钟冗余
        let expiresAt = new Date(Date.now() + 50 * 60 * 1000).toISOString()  // 默认 50 分钟
        try {
          const firstV = data.data?.dash?.video?.[0]
          const bu = firstV?.base_url || firstV?.baseUrl || ''
          if (bu) {
            const dl = new URL(bu).searchParams.get('deadline')
            if (dl) {
              const dlMs = Number(dl) * 1000
              if (dlMs > Date.now()) {
                // 留 5 分钟冗余
                expiresAt = new Date(dlMs - 5 * 60 * 1000).toISOString()
              }
            }
          }
        } catch {}
        await execute('UPDATE articles SET stream_data = ?, stream_expires_at = ? WHERE id = ?', [
          JSON.stringify(data.data), expiresAt, id,
        ])
        const verify = await query('SELECT stream_data FROM articles WHERE id = ?', [id])
        if (!verify?.[0]?.stream_data) {
          return Response.json({ success: false, error: '写入D1失败(0行)', verify })
        }
        success = true
        break
      } catch (e: any) {
        errors.push(`${proxyUrl}: ${e?.message || e}`)
        console.error('[refresh-stream] proxy error:', e?.message)
      }
    }

    if (success) {
      return Response.json({ success: true, message: '直链已刷新' })
    }
    return Response.json({ success: false, error: '所有代理失败: ' + errors.join(' | '), errors }, { status: 502 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}

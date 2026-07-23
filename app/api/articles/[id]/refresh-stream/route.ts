import { NextRequest } from 'next/server'
import { query, execute } from '@/lib/db'
import { extractBilibiliBvid } from '@/lib/bilibili'
import { fetchPlayurl, fetchBilibiliInfo } from '@/lib/deno-proxy'

export async function POST(
  request: NextRequest,
  context: any
) {
  try {
    const { id } = await context.params
    let body: any = {}
    try { body = await request.json() } catch {}
    const requestedCid = body.cid ? Number(body.cid) : null

    let articles: any[] = await query('SELECT bilibili_url FROM articles WHERE id = ? AND published = 1', [id]).catch(() => [])
    if (!articles.length) {
      try { await execute("ALTER TABLE articles ADD COLUMN stream_data TEXT", []) } catch {}
      try { await execute("ALTER TABLE articles ADD COLUMN stream_expires_at TEXT", []) } catch {}
      const retry = await query('SELECT bilibili_url FROM articles WHERE id = ? AND published = 1', [id])
      if (!retry.length) return Response.json({ success: false, error: 'Not found' }, { status: 404 })
      articles = retry
    }
    const bilibiliUrl = (articles[0] as any).bilibili_url
    if (!bilibiliUrl) return Response.json({ success: false, error: 'No bilibili URL' }, { status: 400 })

    const bvid = extractBilibiliBvid(bilibiliUrl)
    if (!bvid) return Response.json({ success: false, error: 'Invalid bilibili URL' }, { status: 400 })

    // 如果没传 cid, 尝试从 URL ?p=N 提取并查 cid
    let cidToUse = requestedCid
    if (!cidToUse) {
      const pMatch = bilibiliUrl.match(/[?&]p=(\d+)/)
      if (pMatch) {
        const page = parseInt(pMatch[1], 10)
        try {
          const infoData = await fetchBilibiliInfo(`https://www.bilibili.com/video/${bvid}`)
          const found = (infoData.series?.videos || []).find((v: { page: number; cid: number }) => v.page === page)
          if (found?.cid) cidToUse = Number(found.cid)
        } catch {}
      }
    }

    let success = false
    const errors: string[] = []
    try {
      const playData = await fetchPlayurl(bvid, cidToUse || undefined, 80)
      if (playData?.dash) {
        let expiresAt = new Date(Date.now() + 50 * 60 * 1000).toISOString()
        try {
          const bu = playData.dash.video?.[0]?.baseUrl || playData.dash.video?.[0]?.base_url || ''
          const dl = new URL(bu).searchParams.get('deadline')
          if (dl) { const dlMs = Number(dl) * 1000; if (dlMs > Date.now()) expiresAt = new Date(dlMs - 5 * 60 * 1000).toISOString() }
        } catch {}
        await execute('UPDATE articles SET stream_data = ?, stream_expires_at = ? WHERE id = ?', [
          JSON.stringify(playData), expiresAt, id,
        ])
        success = true
      }
    } catch (e: any) {
      errors.push(e?.message || e)
    }

    if (success) return Response.json({ success: true, message: '直链已刷新' })
    return Response.json({ success: false, error: '所有代理失败: ' + errors.join(' | ') }, { status: 502 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}
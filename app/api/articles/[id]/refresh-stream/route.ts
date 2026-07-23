import { NextRequest } from 'next/server'
import { query, execute } from '@/lib/db'
import { extractBilibiliBvid } from '@/lib/bilibili'
import { fetchPlayurl } from '@/lib/deno-proxy'

function extractCidFromContent(content: any, page: number): number | undefined {
  if (!content || !page) return undefined
  try {
    const c = typeof content === 'string' ? JSON.parse(content) : content
    let list: any[] = []
    if (Array.isArray(c)) list = c
    else if (c?.videos && Array.isArray(c.videos)) list = c.videos
    const found = list.find((v: any) => Number(v.page) === page)
    return found?.cid ? Number(found.cid) : undefined
  } catch { return undefined }
}

export async function POST(
  request: NextRequest,
  context: any
) {
  try {
    const { id } = await context.params
    let body: any = {}
    try { body = await request.json() } catch {}
    const requestedPage = body.page ? Number(body.page) : 1

    await query('SELECT stream_data FROM articles WHERE id = ?', [id]).catch(async () => {
      try { await execute('ALTER TABLE articles ADD COLUMN stream_data TEXT', []) } catch {}
    })

    const articles: any[] = await query(
      'SELECT id, stream_data, bilibili_url, content FROM articles WHERE id = ?',
      [id]
    ).catch(() => [])
    if (!articles.length) {
      return Response.json({ success: false, error: 'Not found' }, { status: 404 })
    }
    const article = articles[0] as any

    const bvid = extractBilibiliBvid(article.bilibili_url || '')
    if (!bvid) {
      return Response.json({ success: false, error: 'No bilibili URL' }, { status: 400 })
    }

    let cid = extractCidFromContent(article.content, requestedPage)
    if (!cid && requestedPage > 1) {
      try {
        const bvid2 = bvid
        const infoRes = await fetch(`${new URL(request.url).origin}/api/bvid/${bvid2}`)
        if (infoRes.ok) {
          const infoJson = await infoRes.json()
          if (infoJson.success && infoJson.data?.pages?.length) {
            const page = infoJson.data.pages.find((p: { page: number; cid: number }) => p.page === requestedPage)
            if (page?.cid) cid = page.cid
          }
        }
      } catch {}
    }

    try {
      const playData = await fetchPlayurl(bvid, cid, 80)
      if (playData?.dash) {
        // 按 page 分开存: stream_data = { "1": playData, "2": playData, ... }
        let streamMap: Record<string, any> = {}
        try {
          const existing = article.stream_data ? JSON.parse(article.stream_data) : null
          if (existing?.dash) streamMap['1'] = existing  // 兼容旧单P格式
          else if (typeof existing === 'object' && existing) streamMap = existing
        } catch {}
        streamMap[String(requestedPage)] = playData
        await execute('UPDATE articles SET stream_data = ? WHERE id = ?', [
          JSON.stringify(streamMap), id,
        ])
        return Response.json({ success: true, message: `第${requestedPage}集直链已刷新` })
      }
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 502 })
    }

    return Response.json({ success: false, error: 'playurl 返回无效数据' }, { status: 502 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}

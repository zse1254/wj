import { NextRequest } from 'next/server'
import { query, execute } from '@/lib/db'
import { extractBilibiliBvid } from '@/lib/bilibili'
import { fetchPlayurl } from '@/lib/deno-proxy'

// POST /api/refresh-stream  { bvid, page? }
// 按 bvid+page 从 B站 拉最新直链，存到对应 article 的 D1 stream_data 里
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const bvid = body.bvid as string
    const page = Number(body.page) || 1
    if (!bvid || !/^BV[a-zA-Z0-9]+$/.test(bvid)) {
      return Response.json({ success: false, error: 'Invalid bvid' }, { status: 400 })
    }

    // 找到对应 article
    const articles: any[] = await query(
      'SELECT id, stream_data, content FROM articles WHERE bilibili_url LIKE ? AND published = 1',
      [`%${bvid}%`]
    ).catch(() => [])

    let articleId: string | null = null
    let existingMap: Record<string, any> = {}

    if (articles.length) {
      articleId = articles[0].id
      try {
        const raw = articles[0].stream_data ? JSON.parse(articles[0].stream_data) : null
        if (raw?.dash) existingMap['1'] = raw
        else if (typeof raw === 'object' && raw) existingMap = raw
      } catch {}
    }

    // 提取 cid
    let cid: number | undefined
    if (articles.length && articles[0].content) {
      try {
        const c = typeof articles[0].content === 'string' ? JSON.parse(articles[0].content) : articles[0].content
        let list: any[] = []
        if (Array.isArray(c)) list = c
        else if (c?.videos && Array.isArray(c.videos)) list = c.videos
        const found = list.find((v: any) => Number(v.page) === page)
        if (found?.cid) cid = Number(found.cid)
      } catch {}
    }

    // 拉 playurl
    const playData = await fetchPlayurl(bvid, cid, 80)
    if (!playData?.dash) {
      return Response.json({ success: false, error: 'playurl 返回无效数据' }, { status: 502 })
    }

    // 存到 D1
    if (articleId) {
      existingMap[String(page)] = playData
      await execute('UPDATE articles SET stream_data = ? WHERE id = ?', [
        JSON.stringify(existingMap), articleId,
      ])
    }

    return Response.json({
      success: true,
      data: { articleId, page, hasDash: true },
    })
  } catch (err: any) {
    return Response.json({ success: false, error: err.message }, { status: 500 })
  }
}

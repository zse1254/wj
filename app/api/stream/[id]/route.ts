import { NextRequest } from 'next/server'
import { query, execute } from '@/lib/db'
import { extractBilibiliBvid } from '@/lib/bilibili'
import { fetchPlayurl } from '@/lib/deno-proxy'

function replaceHost(url: string, newHost: string): string {
  try { const u = new URL(url); u.host = newHost; return u.toString() } catch { return url }
}

function getUrl(stream: any, cdnParam: string): string {
  const base = stream.baseUrl || stream.base_url || ''
  if (!cdnParam || cdnParam === '0' || cdnParam === 'orig') return base
  if (cdnParam.startsWith('host:')) return replaceHost(base, cdnParam.slice(5))
  const idx = parseInt(cdnParam, 10)
  if (!isNaN(idx) && idx > 0) {
    const backups = stream.backupUrl || stream.backup_url || []
    return backups[idx - 1] || backups[0] || base
  }
  return base
}

function getSegmentBase(stream: any): { init: string; index: string } {
  const sb = stream.segment_base || stream.segmentBase
  if (sb) {
    return {
      init: sb.initialization || sb.Initialization || '0-131072',
      index: sb.index_range || sb.indexRange || '0-131072',
    }
  }
  return { init: '0-131072', index: '0-131072' }
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function buildMpd(data: any, cdnParam: string, qnParam?: string, audioParam?: string): string {
  const duration = data.video_duration || data.dash?.duration || 0
  const durStr = `PT${duration}S`
  let streams = (data.dash?.video || []).filter((v: any) => {
    const c = (v.codecs || '').toLowerCase()
    return c.startsWith('avc')
  })
  let audioStreams = data.dash?.audio || []

  if (streams.length === 0) streams = data.dash?.video || []

  if (qnParam && qnParam !== 'all') {
    const qn = parseInt(qnParam, 10)
    if (!isNaN(qn)) {
      const filtered = streams.filter((v: any) => v.id === qn)
      if (filtered.length) streams = filtered
    }
  }
  if (audioParam && audioParam !== 'all') {
    const aid = parseInt(audioParam, 10)
    if (!isNaN(aid)) {
      const filtered = audioStreams.filter((a: any) => a.id === aid)
      if (filtered.length) audioStreams = filtered
    }
  }

  const proxyBase = `https://rustic-mayfly-8854.zse1254.deno.net/proxy?u=`

  const videoReps = streams.map((v: any, i: number) => {
    const sb = getSegmentBase(v)
    const codecs = v.codecs || 'avc1.64001F'
    const w = v.width || 1920
    const h = v.height || 1080
    const bw = v.bandwidth || v.bandWidth || 1000000
    const proxiedUrl = proxyBase + encodeURIComponent(getUrl(v, cdnParam))
    return `
    <Representation id="v-${v.id || i}-${i}" mimeType="video/mp4" bandwidth="${bw}" width="${w}" height="${h}" codecs="${escapeXml(codecs)}">
      <BaseURL>${escapeXml(proxiedUrl)}</BaseURL>
      <SegmentBase indexRange="${sb.index}">
        <Initialization range="${sb.init}"/>
      </SegmentBase>
    </Representation>`
  }).join('\n')

  const audioReps = audioStreams.map((a: any, i: number) => {
    const sb = getSegmentBase(a)
    const codecs = a.codecs || 'mp4a.40.2'
    const bw = a.bandwidth || a.bandWidth || 128000
    const proxiedUrl = proxyBase + encodeURIComponent(getUrl(a, cdnParam))
    return `
    <Representation id="a-${a.id || i}-${i}" mimeType="audio/mp4" bandwidth="${bw}" codecs="${escapeXml(codecs)}">
      <BaseURL>${escapeXml(proxiedUrl)}</BaseURL>
      <SegmentBase indexRange="${sb.index}">
        <Initialization range="${sb.init}"/>
      </SegmentBase>
    </Representation>`
  }).join('\n')

  return `<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" type="static" mediaPresentationDuration="${durStr}" minBufferTime="PT1.500S">
  <Period id="1" start="PT0S">
    <AdaptationSet id="1" contentType="video" segmentAlignment="true" bitstreamSwitching="true">
      ${videoReps}
    </AdaptationSet>
    <AdaptationSet id="2" contentType="audio" segmentAlignment="true" bitstreamSwitching="true">
      ${audioReps}
    </AdaptationSet>
  </Period>
</MPD>`
}

// 从 content 提取 page 列表并找 cid
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

// stream_data 存储格式: { "1": {...playData...}, "2": {...playData...} }
// 单P文章: stream_data 直接是 playData JSON
// 多P合集: stream_data 是 { "page_num": playData } 的 map
function getStreamMap(streamDataRaw: string | null): Record<string, any> {
  if (!streamDataRaw) return {}
  try {
    const parsed = JSON.parse(streamDataRaw)
    // 单P: 直接是 playData 对象 (有 dash 字段)
    if (parsed?.dash) return { '1': parsed }
    // 多P map: { "1": playData, "2": playData }
    if (typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    return {}
  } catch { return {} }
}

function saveStreamMap(articleId: string, map: Record<string, any>) {
  return execute('UPDATE articles SET stream_data = ? WHERE id = ?', [
    JSON.stringify(map), articleId,
  ])
}

export async function GET(
  request: NextRequest,
  context: any
) {
  try {
    const { id } = await context.params
    const cdnParam = request.nextUrl.searchParams.get('cdn') || '0'
    const qnParam = request.nextUrl.searchParams.get('qn') || 'all'
    const audioParam = request.nextUrl.searchParams.get('audio') || 'all'
    const pageParam = parseInt(request.nextUrl.searchParams.get('p') || '1', 10)

    // 确保 D1 列存在
    await query('SELECT stream_data FROM articles WHERE id = ?', [id]).catch(async () => {
      try { await execute('ALTER TABLE articles ADD COLUMN stream_data TEXT', []) } catch {}
    })

    const articles: any[] = await query(
      'SELECT id, stream_data, bilibili_url, content FROM articles WHERE id = ?',
      [id]
    ).catch(() => [])
    if (!articles.length) {
      return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
    }
    const article = articles[0] as any

    const bvid = extractBilibiliBvid(article.bilibili_url || '')
    if (!bvid) {
      return new Response('No bilibili URL', { status: 400, headers: { 'Content-Type': 'text/plain' } })
    }

    // 根据 p 参数提取 cid: 先从 content 找, 找不到就调 /api/bvid
    let playCid: number | undefined
    if (pageParam >= 1) {
      playCid = extractCidFromContent(article.content, pageParam)
      if (!playCid && pageParam > 1) {
        try {
          const infoRes = await fetch(`${request.nextUrl.origin}/api/bvid/${bvid}`)
          if (infoRes.ok) {
            const infoJson = await infoRes.json()
            if (infoJson.success && infoJson.data?.pages?.length) {
              const page = infoJson.data.pages.find((p: { page: number; cid: number }) => p.page === pageParam)
              if (page?.cid) playCid = page.cid
            }
          }
        } catch {}
      }
    }

    // 从 D1 按 page 读缓存
    const streamMap = getStreamMap(article.stream_data)
    const pageKey = String(pageParam)
    let cached = streamMap[pageKey]
    let needRefresh = !cached

    if (cached) {
      // 检查过期: 从 baseUrl 的 deadline 参数判断
      try {
        const bu = cached.dash?.video?.[0]?.baseUrl || cached.dash?.video?.[0]?.base_url || ''
        const dl = new URL(bu).searchParams.get('deadline')
        if (dl) {
          const dlMs = Number(dl) * 1000
          if (dlMs < Date.now()) needRefresh = true
        }
      } catch {}
    }

    // 过期或缺失 → 实时拉一次
    if (needRefresh) {
      try {
        const playData = await fetchPlayurl(bvid, playCid, 80)
        if (playData?.dash) {
          streamMap[pageKey] = playData
          await saveStreamMap(id, streamMap)
          cached = playData
        }
      } catch (err: any) {
        console.error('[stream] refresh error:', err.message)
      }
    }

    if (!cached?.dash) {
      return new Response('Stream data unavailable', {
        status: 502, headers: { 'Content-Type': 'text/plain' }
      })
    }

    const mpd = buildMpd(cached, cdnParam, qnParam, audioParam)

    return new Response(mpd, {
      status: 200,
      headers: {
        'Content-Type': 'application/dash+xml',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err: any) {
    console.error('[stream] error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }
}

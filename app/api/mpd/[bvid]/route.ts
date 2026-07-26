import { NextRequest } from 'next/server'
import { fetchPlayurl } from '@/lib/deno-proxy'

export const dynamic = 'force-dynamic'

// 把 URL 的 host 替换为指定 CDN host
function replaceHost(url: string, newHost: string): string {
  try { const u = new URL(url); u.host = newHost; return u.toString() } catch { return url }
}

function getUrl(stream: any, cdnParam: string): string {
  const base = stream.baseUrl || stream.base_url || ''
  if (!cdnParam || cdnParam === '0' || cdnParam === 'orig') return base
  if (cdnParam.startsWith('host:')) {
    return replaceHost(base, cdnParam.slice(5))
  }
  const idx = parseInt(cdnParam, 10)
  if (!isNaN(idx) && idx > 0) {
    const backups = stream.backupUrl || stream.backup_url || []
    return backups[idx - 1] || backups[0] || base
  }
  return base
}

function getSegmentBase(stream: any): { init: string; index: string } {
  const sb = stream.segment_base || stream.SegmentBase
  if (sb) {
    const init = sb.initialization || sb.Initialization || '0-131072'
    const index = sb.index_range || sb.indexRange || '0-131072'
    return { init, index }
  }
  return { init: '0-131072', index: '0-131072' }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '\x26amp;')
    .replace(/</g, '\x26lt;')
    .replace(/>/g, '\x26gt;')
    .replace(/"/g, '\x26quot;')
    .replace(/'/g, '\x26apos;')
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

  const cdnProxyBase = `/api/cdn-proxy?u=`

  const videoReps = streams.map((v: any, i: number) => {
    const sb = getSegmentBase(v)
    const codecs = v.codecs || 'avc1.64001F'
    const w = v.width || 1920
    const h = v.height || 1080
    const bw = v.bandwidth || v.bandWidth || 1000000
    const proxiedUrl = cdnProxyBase + encodeURIComponent(getUrl(v, cdnParam))
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
    const proxiedUrl = cdnProxyBase + encodeURIComponent(getUrl(a, cdnParam))
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
      ${videoReps || '<Representation bandwidth="1"><BaseURL></BaseURL></Representation>'}
    </AdaptationSet>
    <AdaptationSet id="2" contentType="audio" segmentAlignment="true" bitstreamSwitching="true">
      ${audioReps || '<Representation bandwidth="1"><BaseURL></BaseURL></Representation>'}
    </AdaptationSet>
  </Period>
</MPD>`
}

export async function GET(
  request: NextRequest,
  context: any
) {
  try {
    const { bvid } = await context.params
    if (!/^BV[a-zA-Z0-9]+$/.test(bvid)) {
      return new Response('Invalid bvid', { status: 400, headers: { 'Content-Type': 'text/plain' } })
    }
    const cdnParam = request.nextUrl.searchParams.get('cdn') || '0'
    const qnParam = request.nextUrl.searchParams.get('qn') || 'all'
    const audioParam = request.nextUrl.searchParams.get('audio') || 'all'
    const pageParam = parseInt(request.nextUrl.searchParams.get('p') || '0', 10)

    // 若有多 P 参数, 先获取对应分 P 的 cid
    let cid: number | undefined
    if (pageParam > 1) {
      try {
        const infoRes = await fetch(`${request.nextUrl.origin}/api/bvid/${bvid}`)
        if (infoRes.ok) {
          const infoJson = await infoRes.json()
          if (infoJson.success && infoJson.data?.pages?.length) {
            const page = infoJson.data.pages.find((p: { page: number; cid: number }) => p.page === pageParam)
            if (page?.cid) cid = page.cid
          }
        }
      } catch {}
    }

    // 从 Deno 代理获取 playurl (B站 API 被 CF Workers IP 封锁)
    let data: any = null
    try {
      data = await fetchPlayurl(bvid, cid || undefined, 80)
    } catch (err: any) {
      console.error('[mpd/bvid] playurl error:', err.message)
    }

    if (!data || !data.dash) {
      return new Response('Failed to fetch DASH stream from Bilibili', { status: 502, headers: { 'Content-Type': 'text/plain' } })
    }

    const mpd = buildMpd(data, cdnParam, qnParam, audioParam)

    return new Response(mpd, {
      status: 200,
      headers: {
        'Content-Type': 'application/dash+xml',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err: any) {
    console.error('[mpd/bvid] error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
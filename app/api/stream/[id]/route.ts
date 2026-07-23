import { NextRequest } from 'next/server'
import { query, execute } from '@/lib/db'
import { extractBilibiliBvid } from '@/lib/bilibili'
import { DENO_PROXIES } from '@/lib/deno-proxy'

// 把 URL 的 host 替换为指定 CDN host
function replaceHost(url: string, newHost: string): string {
  try {
    const u = new URL(url)
    u.host = newHost
    return u.toString()
  } catch {
    return url
  }
}

// 根据 cdn 参数取出最终 URL
//   - cdn=0 / 空        → 原 base_url
//   - cdn=1..N         → 第 N 个 backup_url（1-indexed）
//   - cdn=host:xxx     → 把 host 替换为 xxx（应用所有 base/backup）
function getUrl(stream: any, cdnParam: string): string {
  const base = stream.baseUrl || stream.base_url || ''
  if (!cdnParam || cdnParam === '0' || cdnParam === 'orig') return base
  if (cdnParam.startsWith('host:')) {
    const newHost = cdnParam.slice(5)
    return replaceHost(base, newHost)
  }
  const idx = parseInt(cdnParam, 10)
  if (!isNaN(idx) && idx > 0) {
    const backups = stream.backupUrl || stream.backup_url || []
    const u = backups[idx - 1] || backups[0] || base
    return u
  }
  return base
}

function getSegmentBase(stream: any): { init: string; index: string } {
  const sb = stream.segment_base || stream.segmentBase
  if (sb) {
    const init = sb.initialization || sb.Initialization || '0-131072'
    const index = sb.index_range || sb.indexRange || '0-131072'
    return { init, index }
  }
  return { init: '0-131072', index: '0-131072' }
}

function buildMpd(data: any, articleId: string, cdnParam: string, qnParam?: string, audioParam?: string): string {
  const duration = data.video_duration || data.dash?.duration || 0
  const durStr = `PT${duration}S`
  let streams = data.dash?.video || []
  let audioStreams = data.dash?.audio || []

  // 按 qn 过滤视频流（多清晰度时只留指定的）
  if (qnParam && qnParam !== 'all') {
    const qn = parseInt(qnParam, 10)
    if (!isNaN(qn)) {
      const filtered = streams.filter((v: any) => v.id === qn)
      if (filtered.length) streams = filtered
    }
  }

  // 按 audio id 过滤音轨
  if (audioParam && audioParam !== 'all') {
    const aid = parseInt(audioParam, 10)
    if (!isNaN(aid)) {
      const filtered = audioStreams.filter((a: any) => a.id === aid)
      if (filtered.length) audioStreams = filtered
    }
  }

  // 把 B站 CDN 直链包装成走 Deno Deploy 代理
  // 原因: B站 CDN 校验 Referer, 浏览器跨域发请求时 Referer 是 wj.hvhh.cn 会被拒 403
  // Deno Deploy 代理加固定 Referer: https://www.bilibili.com 即可绕过
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
      ${videoReps || '<Representation bandwidth="1"><BaseURL></BaseURL></Representation>'}
    </AdaptationSet>
    <AdaptationSet id="2" contentType="audio" segmentAlignment="true" bitstreamSwitching="true">
      ${audioReps || '<Representation bandwidth="1"><BaseURL></BaseURL></Representation>'}
    </AdaptationSet>
  </Period>
</MPD>`
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '\x26amp;')
    .replace(/</g, '\x26lt;')
    .replace(/>/g, '\x26gt;')
    .replace(/"/g, '\x26quot;')
    .replace(/'/g, '\x26apos;')
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

    let articles: any[] = await query('SELECT id, stream_data, stream_expires_at FROM articles WHERE id = ?', [id]).catch(() => [])
    if (!articles.length) {
      try { await query("ALTER TABLE articles ADD COLUMN stream_data TEXT", []) } catch {}
      try { await query("ALTER TABLE articles ADD COLUMN stream_expires_at TEXT", []) } catch {}
      articles = await query('SELECT id, stream_data, stream_expires_at FROM articles WHERE id = ?', [id])
    }
    if (!articles.length) {
      return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
    }
    const article = articles[0] as any

    let streamData: any = null
    let needRefresh = !article.stream_data || !article.stream_expires_at || new Date(article.stream_expires_at) < new Date()

    // 失效/缺失 → 自动从 Deno 重拉 (最多1次, 避免死循环)
    if (needRefresh) {
      const bvid = extractBilibiliBvid(article.bilibili_url || '')
      if (bvid) {
        for (const proxyUrl of DENO_PROXIES) {
          try {
            const res = await fetch(proxyUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'playurl', bvid, qn: 80 }),
              signal: AbortSignal.timeout(10000),
            })
            const json = await res.json().catch(() => null)
            if (!res.ok || !json?.success || !json.data?.dash) continue
            let expiresAt = new Date(Date.now() + 50 * 60 * 1000).toISOString()
            try {
              const bu = json.data.dash.video?.[0]?.base_url || json.data.dash.video?.[0]?.baseUrl || ''
              const dl = new URL(bu).searchParams.get('deadline')
              if (dl) { const dlMs = Number(dl) * 1000; if (dlMs > Date.now()) expiresAt = new Date(dlMs - 5 * 60 * 1000).toISOString() }
            } catch {}
            await execute('UPDATE articles SET stream_data = ?, stream_expires_at = ? WHERE id = ?', [
              JSON.stringify(json.data), expiresAt, id,
            ])
            streamData = json.data
            break
          } catch {}
        }
      }
      if (!streamData) {
        return new Response('Stream data expired or unavailable, refresh failed', { status: 410, headers: { 'Content-Type': 'text/plain' } })
      }
    } else {
      streamData = JSON.parse(article.stream_data)
    }

    const mpd = buildMpd(streamData, id, cdnParam, qnParam, audioParam)

    return new Response(mpd, {
      status: 200,
      headers: {
        'Content-Type': 'application/dash+xml',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (err: any) {
    console.error('[stream] error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

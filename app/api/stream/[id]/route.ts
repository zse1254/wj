import { NextRequest } from 'next/server'
import { query } from '@/lib/db'

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

function buildMpd(data: any, cdnParam: string): string {
  const duration = data.video_duration || data.dash?.duration || 0
  const durStr = `PT${duration}S`
  const streams = data.dash?.video || []
  const audioStreams = data.dash?.audio || []

  const videoReps = streams.map((v: any, i: number) => {
    const sb = getSegmentBase(v)
    const codecs = v.codecs || 'avc1.64001F'
    const w = v.width || 1920
    const h = v.height || 1080
    const bw = v.bandwidth || v.bandWidth || 1000000
    return `
    <Representation id="v-${v.id || i}" mimeType="video/mp4" bandwidth="${bw}" width="${w}" height="${h}" codecs="${escapeXml(codecs)}">
      <BaseURL>${escapeXml(getUrl(v, cdnParam))}</BaseURL>
      <SegmentBase indexRange="${sb.index}">
        <Initialization range="${sb.init}"/>
      </SegmentBase>
    </Representation>`
  }).join('\n')

  const audioReps = audioStreams.map((a: any, i: number) => {
    const sb = getSegmentBase(a)
    const codecs = a.codecs || 'mp4a.40.2'
    const bw = a.bandwidth || a.bandWidth || 128000
    return `
    <Representation id="a-${a.id || i}" mimeType="audio/mp4" bandwidth="${bw}" codecs="${escapeXml(codecs)}">
      <BaseURL>${escapeXml(getUrl(a, cdnParam))}</BaseURL>
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

    if (!article.stream_data || !article.stream_expires_at) {
      return new Response('Stream data not available', { status: 404, headers: { 'Content-Type': 'text/plain' } })
    }

    if (new Date(article.stream_expires_at) < new Date()) {
      return new Response('Stream data expired', { status: 410, headers: { 'Content-Type': 'text/plain' } })
    }

    const streamData = JSON.parse(article.stream_data)
    const mpd = buildMpd(streamData, cdnParam)

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

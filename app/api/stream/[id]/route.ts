import { NextRequest } from 'next/server'
import { query } from '@/lib/db'

function getUrl(stream: any, cdnIndex: number): string {
  const base = stream.baseUrl || stream.base_url || ''
  if (cdnIndex === 0) return base
  const backups = stream.backupUrl || stream.backup_url || []
  return backups[cdnIndex - 1] || base
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

function buildMpd(data: any, cdnIndex: number): string {
  const duration = data.video_duration || data.dash?.duration || 0
  const durStr = `PT${duration}S`
  const streams = data.dash?.video || []
  const audioStreams = data.dash?.audio || []

  const videoReps = streams.map((v: any, i: number) => {
    const sb = getSegmentBase(v)
    const codecs = v.codecs || 'avc1.64001F'
    const w = v.width || 1920
    const h = v.height || 1080
    const bw = v.bandwidth || 1000000
    return `
    <Representation id="${v.id || i}" mimeType="video/mp4" bandwidth="${bw}" width="${w}" height="${h}" codecs="${escapeXml(codecs)}">
      <BaseURL>${escapeXml(getUrl(v, cdnIndex))}</BaseURL>
      <SegmentBase indexRange="${sb.index}">
        <Initialization range="${sb.init}"/>
      </SegmentBase>
    </Representation>`
  }).join('\n')

  const audioReps = audioStreams.map((a: any, i: number) => {
    const sb = getSegmentBase(a)
    const codecs = a.codecs || 'mp4a.40.2'
    const bw = a.bandwidth || 128000
    return `
    <Representation id="${a.id || i}" mimeType="audio/mp4" bandwidth="${bw}" codecs="${escapeXml(codecs)}">
      <BaseURL>${escapeXml(getUrl(a, cdnIndex))}</BaseURL>
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
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

export async function GET(
  request: NextRequest,
  context: any
) {
  try {
    const { id } = await context.params
    const cdnIndex = parseInt(request.nextUrl.searchParams.get('cdn') || '0', 10)

    const articles = await query('SELECT id, stream_data, stream_expires_at FROM articles WHERE id = ?', [id])
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
    console.error('[stream] streamData keys:', Object.keys(streamData), 'has dash:', !!streamData.dash)
    const mpd = buildMpd(streamData, cdnIndex)

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
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

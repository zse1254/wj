import { NextRequest } from 'next/server'
import { query } from '@/lib/db'

function getUrl(dataStream: any, cdnIndex: number): string {
  if (cdnIndex === 0) return dataStream.base_url
  const backups = dataStream.backup_url || []
  return backups[cdnIndex - 1] || dataStream.base_url
}

function buildMpd(data: any, bvid: string, cdnIndex: number): string {
  const duration = data.video_duration || 0
  const durStr = `PT${duration}S`

  const videoReps = (data.dash?.video || []).map((v: any, i: number) => `
    <Representation id="${v.id || i}" mimeType="video/mp4" bandwidth="${v.bandwidth || 1000000}" width="${v.width || 1920}" height="${v.height || 1080}" codecs="avc1.640028">
      <BaseURL>${escapeXml(getUrl(v, cdnIndex))}</BaseURL>
      <SegmentBase indexRange="0-131072">
        <Initialization range="0-131072"/>
      </SegmentBase>
    </Representation>`).join('\n')

  const audioReps = (data.dash?.audio || []).map((a: any, i: number) => `
    <Representation id="${a.id || i}" mimeType="audio/mp4" bandwidth="${a.bandwidth || 128000}" codecs="mp4a.40.2" audioSamplingRate="48000">
      <BaseURL>${escapeXml(getUrl(a, cdnIndex))}</BaseURL>
      <SegmentBase indexRange="0-131072">
        <Initialization range="0-131072"/>
      </SegmentBase>
    </Representation>`).join('\n')

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

    const articles = await query('SELECT id, title, bilibili_url, stream_data, stream_expires_at FROM articles WHERE id = ?', [id])
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
    const bvid = streamData.bvid || ''
    const mpd = buildMpd(streamData, bvid, cdnIndex)

    return new Response(mpd, {
      status: 200,
      headers: {
        'Content-Type': 'application/dash+xml',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (err: any) {
    return new Response(err.message || 'Server error', { status: 500, headers: { 'Content-Type': 'text/plain' } })
  }
}

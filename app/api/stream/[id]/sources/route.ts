import { NextRequest } from 'next/server'
import { query } from '@/lib/db'

const CDN_LABELS: Record<string, string> = {
  'upos-sz-mirrorcos': '腾讯云 COS',
  'upos-sz-mirrorali': '阿里云 OSS',
  'upos-sz-mirrorhwer': '华为云 OBS',
  'upos-sz-mirrorbd': '百度云 BOS',
  'upos-sz-mirrorks3': '金山云 KS3',
  'upos-sz-upcdn': 'B站 UPCDN',
  'upos-sz-mirror': 'B站默认',
}

function labelFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname
    for (const [key, label] of Object.entries(CDN_LABELS)) {
      if (host.includes(key)) return label
    }
    return host.split('.')[0] || host
  } catch {
    return '未知'
  }
}

function extractCdns(streamData: any): { name: string; label: string; index: number }[] {
  const seen = new Map<string, number>()
  const result: { name: string; label: string; index: number }[] = []

  const allStreams = [
    ...(streamData.dash?.video || []),
    ...(streamData.dash?.audio || []),
  ]

  for (const s of allStreams) {
    const base = s.baseUrl || s.base_url || ''
    const backups = s.backupUrl || s.backup_url || []
    const urls = [base, ...backups].filter(Boolean)
    for (let i = 0; i < urls.length; i++) {
      const host = extractCdnKey(urls[i])
      if (!seen.has(host)) {
        seen.set(host, i)
        result.push({ name: host, label: labelFromUrl(urls[i]), index: i })
      }
    }
  }

  return result
}

function extractCdnKey(url: string): string {
  try {
    const host = new URL(url).hostname
    const parts = host.split('.')
    return parts.slice(0, -2).join('.') || host
  } catch {
    return url
  }
}

export async function GET(
  _request: NextRequest,
  context: any
) {
  try {
    const { id } = await context.params
    const articles = await query('SELECT stream_data FROM articles WHERE id = ?', [id])
    if (!articles.length) {
      return Response.json({ success: false, error: 'Not found' }, { status: 404 })
    }
    const article = articles[0] as any
    if (!article.stream_data) {
      return Response.json({ success: false, error: 'No stream data', cdns: [] })
    }
    const streamData = JSON.parse(article.stream_data)
    const cdns = extractCdns(streamData)
    return Response.json({ success: true, cdns })
  } catch (err: any) {
    return Response.json({ success: false, error: err.message, cdns: [] }, { status: 500 })
  }
}

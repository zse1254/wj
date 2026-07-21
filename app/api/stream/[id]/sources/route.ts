import { NextRequest } from 'next/server'
import { query } from '@/lib/db'

// 全部已知 B站 CDN 主机（源自 PiliPalaX APK 的 CDNServiceHost._hostList）
const CDN_HOSTS: { host: string; label: string }[] = [
  { host: 'upos-sz-mirrorcos.bilivideo.com',   label: '腾讯 COS' },
  { host: 'upos-sz-mirrorcosb.bilivideo.com',  label: '腾讯 COS B' },
  { host: 'upos-sz-mirrorcosov.bilivideo.com', label: '腾讯 OV' },
  { host: 'upos-sz-mirrorcoso1.bilivideo.com', label: '腾讯 O1' },
  { host: 'upos-sz-mirrorali.bilivideo.com',   label: '阿里云' },
  { host: 'upos-sz-mirroralib.bilivideo.com',  label: '阿里 B' },
  { host: 'upos-sz-mirroralio1.bilivideo.com', label: '阿里 O1' },
  { host: 'upos-sz-mirroraliov.bilivideo.com', label: '阿里 OV' },
  { host: 'upos-sz-mirrorhw.bilivideo.com',    label: '华为云' },
  { host: 'upos-sz-mirrorhwb.bilivideo.com',   label: '华为 B' },
  { host: 'upos-sz-mirrorhwo1.bilivideo.com',  label: '华为 O1' },
  { host: 'upos-sz-mirrorhwer.bilivideo.com',  label: '华为 ER' },
  { host: 'upos-sz-mirror08h.bilivideo.com',   label: 'B站 08h' },
  { host: 'upos-sz-mirror08c.bilivideo.com',   label: 'B站 08c' },
  { host: 'upos-sz-mirror08ct.bilivideo.com',  label: 'B站 08ct' },
  { host: 'upos-tf-all-tx.bilivideo.com',      label: 'TF-腾讯全节点' },
  { host: 'upos-tf-all-hw.bilivideo.com',      label: 'TF-华为全节点' },
  { host: 'upos-hz-mirrorakam.akamaized.net',  label: 'Akamai' },
  { host: 'cn-hk-eq-bcache-01.bilivideo.com',  label: '香港节点' },
];

// B站清晰度代码（源自 APK VideoQualityCode）
const QN_LABELS: Record<number, string> = {
  6: '240P 极速', 16: '360P 流畅', 32: '480P 清晰', 64: '720P 高清',
  74: '720P60 高帧率', 80: '1080P 高清', 112: '1080P+ 高码率',
  116: '1080P60 高帧率', 120: '4K 超清', 125: 'HDR 真彩',
  126: '杜比视界', 127: '8K 超高清',
};

// B站音轨代码
const AUDIO_LABELS: Record<number, string> = {
  30216: '64K', 30232: '132K', 30280: '192K 高码率',
  30250: '杜比全景声', 30251: '杜比', 30252: 'Hi-Res 无损',
};

// 视频编码
const CODEC_LABELS: Record<string, string> = {
  'avc1': 'H.264', 'hev1': 'H.265 (HEVC)', 'av01': 'AV1',
};

function codecLabel(codecs: string): string {
  const m = codecs.match(/^[a-z0-9]+/i);
  return m ? (CODEC_LABELS[m[0]] || m[0]) : codecs;
}

// 计算给定 baseURL 可替换的全部 CDN；返回 [{key,label}] 其中 key=index+1 留给 backup_url
function extractCdns(streamData: any): { key: string; label: string; index: number }[] {
  const result: { key: string; label: string; index: number }[] = []
  const first = streamData?.dash?.video?.[0] || streamData?.dash?.audio?.[0]
  if (!first) return result
  const base = first.baseUrl || first.base_url || ''
  const backups = first.backupUrl || first.backup_url || []
  const urls = [base, ...backups].filter(Boolean)

  // 列出原始响应里的 backup（按 index 顺序）
  for (let i = 0; i < urls.length; i++) {
    let label = `原始 ${i}`
    try {
      const host = new URL(urls[i]).hostname
      const found = CDN_HOSTS.find(h => host.includes(h.host))
      if (found) label = found.label
      else label = host
    } catch {}
    result.push({ key: i === 0 ? 'orig' : `b${i}`, label, index: i })
  }

  // 追加「替换 host」选项（key=host:xxx），代表强制替换为指定 CDN 主机
  for (const h of CDN_HOSTS) {
    result.push({ key: `host:${h.host}`, label: `替换:${h.label}`, index: -1 })
  }
  return result
}

// 提取可用清晰度列表（来自 dash.video 的不同 id）
function extractQualities(streamData: any): { qn: number; label: string; count: number }[] {
  const videos = streamData?.dash?.video || []
  const map = new Map<number, number>()
  for (const v of videos) {
    const qn = v.id
    map.set(qn, (map.get(qn) || 0) + 1)
  }
  const result: { qn: number; label: string; count: number }[] = []
  for (const [qn, count] of Array.from(map.entries()).sort((a, b) => a[0] - b[0])) {
    result.push({ qn, label: QN_LABELS[qn] || `QN${qn}`, count })
  }
  return result
}

// 提取可用音轨列表
function extractAudios(streamData: any): { id: number; label: string; codecs: string }[] {
  const audios = streamData?.dash?.audio || []
  return audios.map((a: any) => ({
    id: a.id,
    label: AUDIO_LABELS[a.id] || `音轨${a.id}`,
    codecs: a.codecs || '',
  }))
}

export async function GET(
  _request: NextRequest,
  context: any
) {
  try {
    const { id } = await context.params
    let articles: any[] = await query('SELECT stream_data FROM articles WHERE id = ?', [id]).catch(() => [])
    if (!articles.length) {
      try { await query("ALTER TABLE articles ADD COLUMN stream_data TEXT", []) } catch {}
      try { await query("ALTER TABLE articles ADD COLUMN stream_expires_at TEXT", []) } catch {}
      articles = await query('SELECT stream_data FROM articles WHERE id = ?', [id])
    }
    if (!articles.length) {
      return Response.json({ success: false, error: 'Not found' }, { status: 404 })
    }
    const article = articles[0] as any
    if (!article.stream_data) {
      return Response.json({ success: false, error: 'No stream data', cdns: [], qualities: [], audios: [] })
    }
    const streamData = JSON.parse(article.stream_data)
    const cdns = extractCdns(streamData)
    const qualities = extractQualities(streamData)
    const audios = extractAudios(streamData)
    return Response.json({ success: true, cdns, qualities, audios })
  } catch (err: any) {
    return Response.json({ success: false, error: err.message, cdns: [], qualities: [], audios: [] }, { status: 500 })
  }
}

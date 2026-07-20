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
]

// 计算给定 baseURL 可替换的全部 CDN；返回 [{key,label}] 其中 key=index+1 留给 backup_url
function extractCdns(streamData: any): { key: string; label: string; index: number }[] {
  const result: { key: string; label: string; index: number }[] = []
  // base_url 用 index=0，随后是各 backup_url（index 1..N）
  // 注意：所有 URL 的 host 我们都能替换为下面的 CDN 主机列表
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
      return Response.json({ success: false, error: 'No stream data', cdns: [] })
    }
    const streamData = JSON.parse(article.stream_data)
    const cdns = extractCdns(streamData)
    return Response.json({ success: true, cdns })
  } catch (err: any) {
    return Response.json({ success: false, error: err.message, cdns: [] }, { status: 500 })
  }
}

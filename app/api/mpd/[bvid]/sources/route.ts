import { NextRequest } from 'next/server'
import { fetchBilibiliPlayurl } from '@/lib/bilibili'

export const dynamic = 'force-dynamic'

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

const QN_LABELS: Record<number, string> = {
  6: '240P 极速', 16: '360P 流畅', 32: '480P 清晰', 64: '720P 高清',
  74: '720P60 高帧率', 80: '1080P 高清', 112: '1080P+ 高码率',
  116: '1080P60 高帧率', 120: '4K 超清', 125: 'HDR 真彩',
  126: '杜比视界', 127: '8K 超高清',
}

const AUDIO_LABELS: Record<number, string> = {
  30216: '64K', 30232: '132K', 30280: '192K 高码率',
  30250: '杜比全景声', 30251: '杜比', 30252: 'Hi-Res 无损',
}

function extractCdns(streamData: any): { key: string; label: string; index: number }[] {
  const result: { key: string; label: string; index: number }[] = []
  const first = streamData?.dash?.video?.[0] || streamData?.dash?.audio?.[0]
  if (!first) return result
  const base = first.baseUrl || first.base_url || ''
  const backups = first.backupUrl || first.backup_url || []
  const urls = [base, ...backups].filter(Boolean)

  for (let i = 0; i < urls.length; i++) {
    let label = `原始 ${i}`
    try {
      const host = new URL(urls[i]).hostname
      const found = CDN_HOSTS.find(h => host.includes(h.host))
      label = found ? found.label : host
    } catch {}
    result.push({ key: i === 0 ? 'orig' : `b${i}`, label, index: i })
  }
  for (const h of CDN_HOSTS) {
    result.push({ key: `host:${h.host}`, label: `替换:${h.label}`, index: -1 })
  }
  return result
}

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

function extractAudios(streamData: any): { id: number; label: string; codecs: string }[] {
  const audios = streamData?.dash?.audio || []
  return audios.map((a: any) => ({
    id: a.id,
    label: AUDIO_LABELS[a.id] || `音轨${a.id}`,
    codecs: a.codecs || '',
  }))
}

export async function GET(
  request: NextRequest,
  context: any
) {
  try {
    const { bvid } = await context.params
    if (!/^BV[a-zA-Z0-9]+$/.test(bvid)) {
      return Response.json({ success: false, error: 'Invalid bvid' }, { status: 400 })
    }
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

    let data: any = null
    try {
      data = await fetchBilibiliPlayurl(bvid, cid || undefined, 80)
    } catch (err: any) {
      console.error('[mpd/bvid/sources] playurl error:', err.message)
    }
    if (!data || !data.dash) {
      return Response.json({ success: false, error: '无法获取 stream 数据' }, { status: 502 })
    }

    return Response.json({
      success: true,
      cdns: extractCdns(data),
      qualities: extractQualities(data),
      audios: extractAudios(data),
    })
  } catch (err: any) {
    return Response.json({ success: false, error: err.message }, { status: 500 })
  }
}
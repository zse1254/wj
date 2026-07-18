export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' })

  const { url } = req.body || {}
  if (!url) return res.status(400).json({ success: false, error: '请输入 Bilibili 链接' })

  const match = url.match(/bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/)
  if (!match) return res.status(400).json({ success: false, error: '无法识别链接格式' })
  const bvid = match[1]

  try {
    const biliRes = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.bilibili.com',
      },
    })

    if (!biliRes.ok) {
      const htmlRes = await fetch(`https://www.bilibili.com/video/${bvid}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.bilibili.com',
        },
      })
      if (!htmlRes.ok) {
        return res.status(502).json({ success: false, error: `Bilibili ${htmlRes.status}` })
      }
      const html = await htmlRes.text()
      const match = html.match(/window\.__INITIAL_STATE__\s*=\s*({.*?});/)
      if (!match) return res.status(502).json({ success: false, error: '无法解析页面数据' })
      const data = JSON.parse(match[1])
      const vd = data.videoData
      if (!vd) return res.status(502).json({ success: false, error: '未找到视频数据' })
      return res.json({
        success: true,
        data: {
          video: {
            bvid: vd.bvid || bvid, title: vd.title || '', description: (vd.desc || '').slice(0, 500),
            cover_url: vd.pic || '', duration: vd.duration || 0,
          },
          series: data.ugcSeason ? {
            season_id: data.ugcSeason.id, title: data.ugcSeason.title || '',
            videos: (data.ugcSeason.episodes || []).map(ep => ({
              bvid: ep.bvid, title: ep.title || '', cover_url: ep.cover || '',
            })),
          } : undefined,
        },
      })
    }

    const json = await biliRes.json()
    if (json.code !== 0) return res.status(502).json({ success: false, error: json.message || 'Bilibili API error' })

    const d = json.data
    let series
    if (d.ugc_season?.id) {
      try {
        const sRes = await fetch(`https://api.bilibili.com/x/web-interface/season/season?season_id=${d.ugc_season.id}`, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.bilibili.com' },
        })
        const sJson = await sRes.json()
        if (sJson.code === 0 && sJson.data) {
          series = {
            season_id: d.ugc_season.id, title: sJson.data.title || '',
            videos: (sJson.data.episodes || []).map(ep => ({
              bvid: ep.bvid, title: ep.title || '', cover_url: ep.cover || '',
            })),
          }
        }
      } catch {}
    }

    return res.json({
      success: true,
      data: {
        video: {
          bvid: d.bvid, title: d.title || '', description: (d.desc || '').slice(0, 500),
          cover_url: d.pic || '', duration: d.duration || 0,
        },
        series,
      },
    })
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Server error' })
  }
}

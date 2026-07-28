import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

function genBuvid3(): string {
  const h = () => Math.random().toString(16).slice(2, 10)
  return `${h()}-${h().slice(0, 4)}-${h().slice(0, 4)}-${h().slice(0, 4)}-${h()}${h().slice(0, 4)}infoc`
}

export async function GET(request: NextRequest) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.bilibili.com',
    'Origin': 'https://www.bilibili.com',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Cookie': `buvid3=${genBuvid3()}; b_nut=100`,
  }

  const results: any = { ts: new Date().toISOString(), tests: [] }

  const tests = [
    {
      name: 'view',
      url: 'https://api.bilibili.com/x/web-interface/view?bvid=BV1Hz4y1U7nW',
    },
    {
      name: 'pagelist',
      url: 'https://api.bilibili.com/x/player/pagelist?bvid=BV1Hz4y1U7nW',
    },
    {
      name: 'playurl_durl',
      url: 'https://api.bilibili.com/x/player/playurl?bvid=BV1Hz4y1U7nW&cid=292393585&qn=80&fnval=0&fourk=1',
    },
    {
      name: 'cdn_head',
      url: 'https://upos-sz-mirrorcos.bilivideo.com/',
      method: 'HEAD',
    },
  ]

  for (const t of tests) {
    try {
      const r = await fetch(t.url, {
        method: t.method || 'GET',
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      })
      const ct = r.headers.get('content-type') || ''
      let body = ''
      if (t.method !== 'HEAD') {
        body = await r.text()
        if (body.length > 500) body = body.slice(0, 500)
      }
      results.tests.push({
        name: t.name,
        status: r.status,
        ct,
        cl: r.headers.get('content-length'),
        body: body.slice(0, 300),
      })
    } catch (e: any) {
      results.tests.push({ name: t.name, error: e.message })
    }
  }

  return Response.json(results, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  })
}

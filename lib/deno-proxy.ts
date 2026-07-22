export const DENO_PROXIES = [
  'https://rustic-mayfly-8854.zse1254.deno.net',
  'https://clumsy-caribou-2368.zse1254.deno.net',
]

let proxyIndex = 0

function getProxyUrl(): string {
  const url = DENO_PROXIES[proxyIndex % DENO_PROXIES.length]
  proxyIndex++
  return url
}

export async function callDenoProxy(action: string, payload: Record<string, unknown>): Promise<any> {
  const errors: string[] = []
  for (let i = 0; i < DENO_PROXIES.length; i++) {
    const url = getProxyUrl()
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) {
        errors.push(`${url}: status ${res.status}`)
        continue
      }
      const data = await res.json()
      if (data.success) return data
      errors.push(`${url}: ${data.error || 'unknown error'}`)
    } catch (err: any) {
      errors.push(`${url}: ${err.message || 'network error'}`)
    }
  }
  throw new Error(`所有 Deno 代理均失败:\n${errors.join('\n')}`)
}

export async function fetchPlayurl(bvid: string, cid?: number, qn?: number): Promise<any> {
  const result = await callDenoProxy('playurl', { bvid, cid, qn })
  return result.data
}

export async function fetchBilibiliInfo(url: string): Promise<any> {
  const result = await callDenoProxy('info', { url })
  return result.data
}

export async function fetchSearch(keyword: string): Promise<any> {
  const result = await callDenoProxy('search', { keyword })
  return result.data
}

export async function fetchRcmd(): Promise<any> {
  const result = await callDenoProxy('rcmd', {})
  return result.data
}

export async function fetchRanking(rid?: number): Promise<any> {
  const result = await callDenoProxy('ranking', { rid })
  return result.data
}

export async function fetchPopular(pn?: number): Promise<any> {
  const result = await callDenoProxy('popular', { pn })
  return result.data
}

export async function fetchSeason(season_id?: number, mid?: number, series_id?: number): Promise<any> {
  const result = await callDenoProxy('season', { season_id, mid, series_id })
  return result.data
}

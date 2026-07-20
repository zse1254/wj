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

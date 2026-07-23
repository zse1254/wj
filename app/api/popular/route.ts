import { NextRequest } from 'next/server'
import { fetchPopular } from '@/lib/deno-proxy'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const pn = parseInt(request.nextUrl.searchParams.get('pn') || '1', 10)
  try {
    const items = await fetchPopular(pn)
    return Response.json({ success: true, data: { items } })
  } catch (err: any) {
    return Response.json({ success: false, error: '热门服务不可用: ' + (err.message || '未知错误') }, { status: 502 })
  }
}
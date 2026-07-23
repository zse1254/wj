import { NextRequest } from 'next/server'
import { fetchSearch } from '@/lib/deno-proxy'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')
  if (!q || q.length < 2) {
    return Response.json({ success: false, error: '请输入至少2个字符' }, { status: 400 })
  }

  try {
    const items = await fetchSearch(q)
    return Response.json({ success: true, data: { items } })
  } catch (err: any) {
    return Response.json({ success: false, error: '搜索服务不可用: ' + (err.message || '未知错误') }, { status: 502 })
  }
}
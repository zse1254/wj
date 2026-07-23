import { NextRequest } from 'next/server'
import { fetchRanking } from '@/lib/bilibili'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const rid = parseInt(request.nextUrl.searchParams.get('rid') || '0', 10)
  try {
    const data = await fetchRanking(rid)
    return Response.json({ success: true, data: { items: data.items, name: data.name } })
  } catch (err: any) {
    return Response.json({ success: false, error: '排行服务不可用: ' + (err.message || '未知错误') }, { status: 502 })
  }
}
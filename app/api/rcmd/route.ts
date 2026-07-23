import { NextRequest } from 'next/server'
import { fetchRcmd } from '@/lib/bilibili'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest) {
  try {
    const items = await fetchRcmd()
    return Response.json({ success: true, data: { items } })
  } catch (err: any) {
    return Response.json({ success: false, error: '推荐服务不可用: ' + (err.message || '未知错误') }, { status: 502 })
  }
}
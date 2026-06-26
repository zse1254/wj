import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const info: Record<string, unknown> = {
      nodeEnv: process.env.NODE_ENV,
      hasProcess: typeof process !== 'undefined',
      hasDB: typeof process !== 'undefined' && !!(process as any).env?.DB,
      cfPages: typeof process !== 'undefined' ? process.env.CF_PAGES : 'N/A',
      dbType: typeof process !== 'undefined' && !!(process as any).env?.DB ? 'D1' : 'unknown',
    }

    // Try D1 directly
    if (typeof process !== 'undefined' && (process as any).env?.DB) {
      try {
        const d1 = (process as any).env.DB
        const result = await d1.prepare('SELECT 1 as test').all()
        info.d1Result = result.results
        info.d1Ok = true
      } catch (e: any) {
        info.d1Error = e?.message || String(e)
        info.d1Ok = false
      }
    }

    return Response.json({ success: true, data: info })
  } catch (err: any) {
    return Response.json({ success: false, error: err?.message || 'Unknown error' }, { status: 500 })
  }
}

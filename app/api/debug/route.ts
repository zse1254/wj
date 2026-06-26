import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const dbFromProcess = (process as any).env?.DB
    const dbFromCtx = (() => {
      try { const ctx = (globalThis as any)[Symbol.for('__cloudflare-context__')]; return !!ctx?.env?.DB } catch { return false }
    })()
    const db = dbFromProcess || (() => {
      try { const ctx = (globalThis as any)[Symbol.for('__cloudflare-context__')]; return ctx?.env?.DB } catch { return null }
    })()

    const info: Record<string, unknown> = {
      nodeEnv: process.env.NODE_ENV,
      cfPages: process.env.CF_PAGES,
      dbFromProcess: !!dbFromProcess,
      dbFromCloudflareContext: dbFromCtx,
      hasAnyDB: !!db,
      dbType: !!db ? 'D1' : 'unknown',
    }

    // Try D1 directly
    if (db) {
      try {
        const result = await db.prepare('SELECT 1 as test').all()
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

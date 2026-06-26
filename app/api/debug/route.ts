export async function GET() {
  const results: Record<string, unknown> = {}

  results.nodeEnv = process.env.NODE_ENV
  results.cfPages = process.env.CF_PAGES

  try {
    let db: any = null
    try {
      const ctx = (globalThis as any)[Symbol.for('__cloudflare-context__')]
      db = ctx?.env?.DB || null
    } catch {}
    results.dbFromCtx = !!db
    results.dbFromProcess = !!(process as any).env?.DB

    if (db) {
      const r = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
      results.tables = (r.results || []).map((x: any) => x.name)
      const u = await db.prepare('SELECT COUNT(*) as cnt FROM users').all()
      results.userCount = u.results?.[0]?.cnt ?? 0
    }
  } catch (e: any) {
    results.error = e.message
  }

  return Response.json({ success: true, data: results })
}

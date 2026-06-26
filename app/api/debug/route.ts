import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { SignJWT, jwtVerify } from 'jose'
import { query, execute } from '@/lib/db'

export async function GET(request: NextRequest) {
  const results: Record<string, unknown> = {}

  // 1. Environment checks
  results.nodeEnv = process.env.NODE_ENV
  results.cfPages = process.env.CF_PAGES

  // 2. D1 binding checks
  try {
    const dbFromProcess = !!(process as any).env?.DB
    let dbFromCtx = false
    let db: any = null
    try {
      const ctx = (globalThis as any)[Symbol.for('__cloudflare-context__')]
      dbFromCtx = !!ctx?.env?.DB
      db = ctx?.env?.DB || null
    } catch {}
    results.dbFromProcess = dbFromProcess
    results.dbFromCloudflareContext = dbFromCtx
    results.hasAnyDB = !!(db || (process as any).env?.DB)

    if (db) {
      try {
        const r = await db.prepare('SELECT 1 as test').all()
        results.d1QueryOk = true
        results.d1Result = r.results
      } catch (e: any) { results.d1QueryError = e?.message || String(e) }
    }
  } catch (e: any) { results.d1Error = e?.message || String(e) }

  // 3. bcryptjs test
  try {
    const hash = bcrypt.hashSync('test', 4)
    const match = bcrypt.compareSync('test', hash)
    results.bcryptOk = true
    results.bcryptHash = hash.substring(0, 20) + '...'
    results.bcryptMatch = match
  } catch (e: any) { results.bcryptError = e?.message || String(e) }

  // 4. uuid test
  try {
    const id = uuidv4()
    results.uuidOk = true
    results.uuidSample = id
  } catch (e: any) { results.uuidError = e?.message || String(e) }

  // 5. jose test
  try {
    const secret = new TextEncoder().encode('test-secret')
    const jwt = await new SignJWT({ test: true }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(secret)
    const { payload } = await jwtVerify(jwt, secret)
    results.joseOk = true
    results.jwtPayload = payload
  } catch (e: any) { results.joseError = e?.message || String(e) }

  // 6. Direct D1 query test (SELECT on users table)
  try {
    const db = (() => {
      try { const ctx = (globalThis as any)[Symbol.for('__cloudflare-context__')]; return ctx?.env?.DB } catch { return null }
    })()
    if (db) {
      const r = await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
      results.tables = r.results
      const u = await db.prepare('SELECT COUNT(*) as cnt FROM users').all()
      results.userCount = u.results
    }
  } catch (e: any) { results.queryError = e?.message || String(e) }

  return Response.json({ success: true, data: results })
}

const SETUP_KEY = 'setup-wj-db-2024'

function getD1(): any {
  try { const ctx = (globalThis as any)[Symbol.for('__cloudflare-context__')]; return ctx?.env?.DB } catch { return null }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  if (url.searchParams.get('key') !== SETUP_KEY) {
    return Response.json({ success: false, error: 'Invalid key' }, { status: 403 })
  }

  const db = getD1()
  if (!db) return Response.json({ success: false, error: 'D1 not available' }, { status: 500 })

  const log: string[] = []

  const sqls = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0, is_vip INTEGER DEFAULT 0,
      vip_expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL, type TEXT NOT NULL DEFAULT 'article',
      description TEXT, created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY, title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL, content TEXT, summary TEXT,
      cover_url TEXT, type TEXT NOT NULL DEFAULT 'article',
      category_id TEXT, author TEXT, source TEXT, source_url TEXT,
      bilibili_url TEXT, audio_url TEXT, audio_duration INTEGER,
      is_published INTEGER DEFAULT 0, is_featured INTEGER DEFAULT 0,
      published_at TEXT, created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )`,
    `CREATE TABLE IF NOT EXISTS vip_cards (
      id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL,
      duration_days INTEGER NOT NULL, is_used INTEGER DEFAULT 0,
      used_by TEXT, used_at TEXT, created_at TEXT DEFAULT (datetime('now'))
    )`,
  ]

  for (const sql of sqls) {
    try {
      await db.prepare(sql).all()
      log.push(`OK: ${sql.substring(0, 50)}...`)
    } catch (e: any) {
      log.push(`FAIL: ${e.message}`)
    }
  }

  // Seed/update admin (use env vars or defaults)
  try {
    const adminUser = process.env.ADMIN_USERNAME || 'admin'
    const adminPass = process.env.ADMIN_PASSWORD || 'admin123'
    const bcrypt = await import('bcryptjs')
    const hash = bcrypt.hashSync(adminPass, 10)
    const existing = await db.prepare("SELECT id FROM users WHERE is_admin = 1").all()
    if (existing.results?.length > 0) {
      await db.prepare("UPDATE users SET username = ?, email = ?, password_hash = ? WHERE is_admin = 1")
        .bind(adminUser, `${adminUser}@example.com`, hash).all()
      log.push(`OK: admin updated (${adminUser} / ${adminPass})`)
    } else {
      const { v4: uuidv4 } = await import('uuid')
      await db.prepare(
        "INSERT INTO users (id, username, email, password_hash, is_admin) VALUES (?, ?, ?, ?, 1)"
      ).bind(uuidv4(), adminUser, `${adminUser}@example.com`, hash).all()
      log.push(`OK: admin seeded (${adminUser} / ${adminPass})`)
    }
  } catch (e: any) {
    log.push(`FAIL seed admin: ${e.message}`)
  }

  // Verify
  try {
    const r = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
    log.push(`Tables: ${(r.results || []).map((x: any) => x.name).join(', ')}`)
  } catch (e: any) {
    log.push(`FAIL verify: ${e.message}`)
  }

  return Response.json({ success: true, log })
}

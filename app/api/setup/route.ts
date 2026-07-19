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
      email TEXT UNIQUE, password_hash TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0, is_vip INTEGER DEFAULT 0,
      vip_expires_at TEXT, invited_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL, type TEXT NOT NULL DEFAULT 'article',
      description TEXT, created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '', cover_image TEXT, type TEXT NOT NULL DEFAULT 'article',
      video_url TEXT, audio_url TEXT, bilibili_url TEXT, is_m3u8 INTEGER DEFAULT 0,
      category_id TEXT, published INTEGER DEFAULT 0, author_id TEXT,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )`,
    `CREATE TABLE IF NOT EXISTS vip_cards (
      id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL,
      duration_days INTEGER NOT NULL, is_used INTEGER DEFAULT 0,
      used_by TEXT, used_at TEXT, created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (used_by) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS invite_codes (
      id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL,
      max_uses INTEGER NOT NULL DEFAULT 1, used_count INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1, note TEXT,
      created_by TEXT, created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS favorites (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
      item_type TEXT NOT NULL, item_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE (user_id, item_type, item_id)
    )`,
    `CREATE TABLE IF NOT EXISTS member_spaces (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL, is_public INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS member_posts (
      id TEXT PRIMARY KEY, space_id TEXT NOT NULL, user_id TEXT NOT NULL,
      bilibili_url TEXT NOT NULL, bvid TEXT, type TEXT NOT NULL DEFAULT 'video',
      title TEXT, cover_image TEXT, duration INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (space_id) REFERENCES member_spaces(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS member_reports (
      id TEXT PRIMARY KEY, post_id TEXT NOT NULL, reporter_id TEXT,
      reason TEXT, created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (post_id) REFERENCES member_posts(id) ON DELETE CASCADE
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

  // Migrate existing tables: add missing columns for schema consistency
  const migrations = [
    "ALTER TABLE articles ADD COLUMN cover_image TEXT",
    "ALTER TABLE articles ADD COLUMN video_url TEXT",
    "ALTER TABLE articles ADD COLUMN is_m3u8 INTEGER DEFAULT 0",
    "ALTER TABLE articles ADD COLUMN published INTEGER DEFAULT 0",
    "ALTER TABLE articles ADD COLUMN author_id TEXT",
    "ALTER TABLE articles ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))",
    "ALTER TABLE articles ADD COLUMN content TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE vip_cards ADD COLUMN note TEXT",
    "ALTER TABLE categories ADD COLUMN parent_id TEXT",
  ]
  for (const sql of migrations) {
    try {
      await db.prepare(sql).all()
      log.push(`MIGRATE OK: ${sql}`)
    } catch (e: any) {
      // Ignore "duplicate column" errors — column already exists
      if (!e.message?.includes('duplicate column')) {
        log.push(`MIGRATE SKIP: ${e.message}`)
      }
    }
  }

  // Migrate users table: drop NOT NULL on email (now optional) + add invited_by
  try {
    const r = await db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").all()
    const sql = r.results?.[0]?.sql as string | undefined
    if (sql && sql.includes('email TEXT UNIQUE NOT NULL')) {
      await db.prepare("ALTER TABLE users RENAME TO users_old").all()
      await db.prepare(
        `CREATE TABLE users (
          id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL,
          email TEXT UNIQUE, password_hash TEXT NOT NULL,
          is_admin INTEGER DEFAULT 0, is_vip INTEGER DEFAULT 0,
          vip_expires_at TEXT, invited_by TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )`
      ).all()
      await db.prepare(
        `INSERT INTO users (id, username, email, password_hash, is_admin, is_vip, vip_expires_at, created_at)
         SELECT id, username, email, password_hash, is_admin, is_vip, vip_expires_at, created_at FROM users_old`
      ).all()
      await db.prepare("DROP TABLE users_old").all()
      log.push('OK: users table migrated (email optional, invited_by added)')
    } else if (sql && !sql.includes('invited_by')) {
      try { await db.prepare("ALTER TABLE users ADD COLUMN invited_by TEXT").all(); log.push('OK: users.invited_by added') } catch {}
    }
  } catch (e: any) {
    log.push(`FAIL migrate users: ${e.message}`)
  }

  // Seed default settings
  try {
    await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").bind('invite_required', '0').all()
    await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").bind('max_favorites', '10').all()
    await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").bind('member_quota', '10').all()
    await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").bind('contact_text', '').all()
    await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").bind('contact_qrcode', '').all()
    await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").bind('space_enabled', '1').all()
    log.push('OK: settings seeded')
  } catch (e: any) {
    log.push(`FAIL seed settings: ${e.message}`)
  }

  // Seed/update admin (must be set via env vars; no hardcoded defaults)
  try {
    const adminUser = process.env.ADMIN_USERNAME
    const adminPass = process.env.ADMIN_PASSWORD
    if (!adminUser || !adminPass) throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD environment variables are required')
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

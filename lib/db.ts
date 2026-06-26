let db: any = null

function getCloudflareDb(): any {
  // Try process.env first (for string bindings)
  const db = (process as any).env?.DB
  if (db) return db
  // Try Cloudflare context (for non-string bindings like D1)
  try {
    const ctx = (globalThis as any)[Symbol.for('__cloudflare-context__')]
    if (ctx?.env?.DB) return ctx.env.DB
  } catch {}
  return undefined
}

// Detect Cloudflare environment: D1 binding exists OR CF_PAGES flag
const isCloudflare = typeof process !== 'undefined' && (!!getCloudflareDb() || process.env.CF_PAGES === '1')

async function getLocalDb() {
  if (db) return db

  const initSqlJs = require('sql.js')
  const fs = require('fs')
  const path = require('path')
  const SQL = await initSqlJs()
  const DB_PATH = path.join(process.cwd(), 'data.db')

  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH))
  } else {
    db = new SQL.Database()
  }

  db.run(`PRAGMA journal_mode=WAL`)
  db.run(`PRAGMA foreign_keys=ON`)

  initTablesLocal(db, fs, DB_PATH)
  seedAdmin(db, fs, DB_PATH)
  return db
}

function initTablesLocal(d: any, fs: any, DB_PATH: string) {
  d.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, is_admin INTEGER DEFAULT 0, is_vip INTEGER DEFAULT 0,
    vip_expires_at TEXT, created_at TEXT DEFAULT (datetime('now'))
  )`)
  d.run(`CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, created_at TEXT DEFAULT (datetime('now'))
  )`)
  d.run(`CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '', cover_image TEXT, type TEXT NOT NULL DEFAULT 'article',
    video_url TEXT, audio_url TEXT, bilibili_url TEXT, is_m3u8 INTEGER DEFAULT 0,
    category_id TEXT, published INTEGER DEFAULT 0, author_id TEXT,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (category_id) REFERENCES categories(id), FOREIGN KEY (author_id) REFERENCES users(id)
  )`)
  d.run(`CREATE TABLE IF NOT EXISTS vip_cards (
    id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, duration_days INTEGER NOT NULL,
    is_used INTEGER DEFAULT 0, used_by TEXT, used_at TEXT, created_by TEXT,
    created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (used_by) REFERENCES users(id)
  )`)
  saveLocalDb(d, fs, DB_PATH)
}

function saveLocalDb(d: any, fs: any, DB_PATH: string) {
  if (!d) return
  const data = d.export()
  fs.writeFileSync(DB_PATH, Buffer.from(data))
}

function seedAdmin(d: any, fs: any, DB_PATH: string) {
  const result = d.exec("SELECT COUNT(*) as count FROM users WHERE is_admin = 1")
  if (result.length > 0 && result[0].values.length > 0 && result[0].values[0][0] > 0) return
  const bcrypt = require('bcryptjs')
  const { v4: uuid } = require('uuid')
  const hash = bcrypt.hashSync('admin123', 10)
  d.run("INSERT INTO users (id, username, email, password_hash, is_admin) VALUES (?, ?, ?, ?, 1)",
    [uuid(), 'admin', 'admin@example.com', hash])
  saveLocalDb(d, fs, DB_PATH)
}

export async function query(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  if (isCloudflare) {
    const d1 = getCloudflareDb()
    if (!d1) return []
    const result = await d1.prepare(sql).bind(...params).all()
    return result.results || []
  }

  const d = await getLocalDb()
  const stmt = d.prepare(sql)
  stmt.bind(params)
  const results: Record<string, unknown>[] = []
  while (stmt.step()) {
    results.push(stmt.getAsObject())
  }
  stmt.free()
  return results
}

export async function execute(sql: string, params: unknown[] = []): Promise<{ changes: number; lastInsertRowid: number | bigint | undefined }> {
  if (isCloudflare) {
    const d1 = getCloudflareDb()
    if (!d1) return { changes: 0, lastInsertRowid: undefined }
    const result = await d1.prepare(sql).bind(...params).run()
    return { changes: result.meta.changes, lastInsertRowid: result.meta.last_row_id }
  }

  const d = await getLocalDb()
  const fs = require('fs')
  const path = require('path')
  d.run(sql, params)
  saveLocalDb(d, fs, path.join(process.cwd(), 'data.db'))
  const lastId = d.exec("SELECT last_insert_rowid() as id")
  const rowId = lastId.length > 0 ? lastId[0].values[0][0] : undefined
  return { changes: d.getRowsModified(), lastInsertRowid: rowId }
}

export async function getFirst(sql: string, params: unknown[] = []): Promise<Record<string, unknown> | null> {
  const results = await query(sql, params)
  return results.length > 0 ? results[0] : null
}

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

const DB_PATH = path.join(process.cwd(), 'data.db')

let db: SqlJsDatabase | null = null

function saveDb() {
  if (!db) return
  const data = db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(DB_PATH, buffer)
}

export async function getDb(): Promise<SqlJsDatabase> {
  if (db) return db

  const SQL = await initSqlJs()

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  db.run(`PRAGMA journal_mode=WAL`)
  db.run(`PRAGMA foreign_keys=ON`)

  initTables()
  seedAdmin()
  return db
}

function initTables() {
  if (!db) return

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0,
      is_vip INTEGER DEFAULT 0,
      vip_expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      cover_image TEXT,
      type TEXT NOT NULL DEFAULT 'article',
      video_url TEXT,
      audio_url TEXT,
      bilibili_url TEXT,
      is_m3u8 INTEGER DEFAULT 0,
      category_id TEXT,
      published INTEGER DEFAULT 0,
      author_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id),
      FOREIGN KEY (author_id) REFERENCES users(id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS vip_cards (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      duration_days INTEGER NOT NULL,
      is_used INTEGER DEFAULT 0,
      used_by TEXT,
      used_at TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (used_by) REFERENCES users(id)
    )
  `)

  saveDb()
}

function seedAdmin() {
  if (!db) return
  const result = db.exec("SELECT COUNT(*) as count FROM users WHERE is_admin = 1")
  if (result.length > 0 && result[0].values.length > 0 && (result[0].values[0][0] as number) > 0) return

  const bcrypt = require('bcryptjs')
  const hash = bcrypt.hashSync('admin123', 10)
  db.run(
    "INSERT INTO users (id, username, email, password_hash, is_admin) VALUES (?, ?, ?, ?, 1)",
    [uuidv4(), 'admin', 'admin@example.com', hash]
  )
  saveDb()
}

export function closeDb() {
  if (db) {
    saveDb()
    db.close()
    db = null
  }
}

export async function query(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const d = await getDb()
  const stmt = d.prepare(sql)
  stmt.bind(params)
  const results: Record<string, unknown>[] = []
  while (stmt.step()) {
    const row = stmt.getAsObject()
    results.push(row)
  }
  stmt.free()
  return results
}

export async function execute(sql: string, params: unknown[] = []): Promise<{ changes: number; lastInsertRowid: number | bigint | undefined }> {
  const d = await getDb()
  d.run(sql, params)
  saveDb()
  const lastId = d.exec("SELECT last_insert_rowid() as id")
  const rowId = lastId.length > 0 ? (lastId[0].values[0][0] as number) : undefined
  return { changes: d.getRowsModified(), lastInsertRowid: rowId }
}

export async function getFirst(sql: string, params: unknown[] = []): Promise<Record<string, unknown> | null> {
  const results = await query(sql, params)
  return results.length > 0 ? results[0] : null
}

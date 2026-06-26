import { execSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";

const DB = "wj-db";

function run(sqlFile) {
  const cmd = `npx wrangler d1 execute ${DB} --file="${sqlFile}" --json`;
  console.log(`Executing: ${sqlFile}`);
  try {
    const out = execSync(cmd, { encoding: "utf8" });
    const parsed = JSON.parse(out);
    if (parsed.success === false) {
      console.error("  Error:", parsed.error);
    } else {
      console.log("  OK");
    }
    return parsed;
  } catch (err) {
    console.error("  Failed:", err.message);
    return null;
  }
}

console.log("=== Creating tables ===");

const tables = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, is_admin INTEGER DEFAULT 0, is_vip INTEGER DEFAULT 0,
    vip_expires_at TEXT, created_at TEXT DEFAULT (datetime('now'))
  );`,
  `CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, created_at TEXT DEFAULT (datetime('now'))
  );`,
  `CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '', cover_image TEXT, type TEXT NOT NULL DEFAULT 'article',
    video_url TEXT, audio_url TEXT, bilibili_url TEXT, is_m3u8 INTEGER DEFAULT 0,
    category_id TEXT, published INTEGER DEFAULT 0, author_id TEXT,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (category_id) REFERENCES categories(id), FOREIGN KEY (author_id) REFERENCES users(id)
  );`,
  `CREATE TABLE IF NOT EXISTS vip_cards (
    id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, duration_days INTEGER NOT NULL,
    is_used INTEGER DEFAULT 0, used_by TEXT, used_at TEXT, created_by TEXT,
    created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (used_by) REFERENCES users(id)
  );`,
];

for (const sql of tables) {
  const tmpFile = `tmp_table_${Date.now()}.sql`;
  writeFileSync(tmpFile, sql, "utf8");
  run(tmpFile);
  try { unlinkSync(tmpFile); } catch {}
}

console.log("\n=== Seeding admin user ===");

// Check if admin exists first
const checkSql = "SELECT COUNT(*) as count FROM users WHERE is_admin = 1;";
const checkFile = `tmp_check_${Date.now()}.sql`;
writeFileSync(checkFile, checkSql, "utf8");
const checkResult = run(checkFile);
try { unlinkSync(checkFile); } catch {}

let adminExists = false;
try {
  if (checkResult && Array.isArray(checkResult)) {
    for (const item of checkResult) {
      if (item?.results?.length > 0 && item.results[0].count > 0) adminExists = true;
    }
  }
  if (checkResult?.results?.length > 0 && checkResult.results[0].count > 0) adminExists = true;
} catch {}

const adminUser = process.env.ADMIN_USERNAME || 'admin'
const adminPass = process.env.ADMIN_PASSWORD || 'admin123'

if (adminExists) {
  // Update existing admin credentials
  const bcrypt = (await import("bcryptjs")).default;
  const hash = bcrypt.hashSync(adminPass, 10);
  const updateSql = `UPDATE users SET password_hash='${hash}', username='${adminUser}', email='${adminUser}@example.com' WHERE is_admin=1;`;
  const updateFile = `tmp_update_${Date.now()}.sql`;
  writeFileSync(updateFile, updateSql, "utf8");
  run(updateFile);
  try { unlinkSync(updateFile); } catch {}
  console.log(`Admin user updated (${adminUser} / ${adminPass}).`);
} else {
  const { v4: uuid } = await import("uuid");
  const bcrypt = (await import("bcryptjs")).default;
  const hash = bcrypt.hashSync(adminPass, 10);
  const id = uuid();
  const insertSql = `INSERT INTO users (id, username, email, password_hash, is_admin) VALUES ('${id}', '${adminUser}', '${adminUser}@example.com', '${hash}', 1);`;
  const insertFile = `tmp_insert_${Date.now()}.sql`;
  writeFileSync(insertFile, insertSql, "utf8");
  run(insertFile);
  try { unlinkSync(insertFile); } catch {}
  console.log(`Admin user seeded (${adminUser} / ${adminPass}).`);
}

console.log("\n=== D1 initialization complete ===");

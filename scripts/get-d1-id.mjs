import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";

function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8" });
  } catch {
    return "";
  }
}

// List existing databases
const listOutput = run("npx wrangler d1 list --json");

try {
  const list = JSON.parse(listOutput);
  const db = list.find((d) => d.name === "wj-db" || d.database_name === "wj-db");
  if (db) {
    const id = db.uuid || db.database_id;
    console.log(`EXISTING_DB_ID=${id}`);
    process.exit(0);
  }
} catch {}

// Try to create it
const createOutput = run("npx wrangler d1 create wj-db --json");
try {
  const result = JSON.parse(createOutput);
  const id = result.uuid || result.database_id || result.id;
  if (id) {
    console.log(`NEW_DB_ID=${id}`);
    process.exit(0);
  }
} catch {}

// Try parsing table format
const tableOutput = run("npx wrangler d1 list");
const match = tableOutput.match(/wj-db\s*\|\s*([a-f0-9-]+)/);
if (match) {
  console.log(`TABLE_DB_ID=${match[1]}`);
  process.exit(0);
}

console.error("Could not find or create D1 database");
process.exit(1);

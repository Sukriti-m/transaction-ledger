import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DATABASE_PATH || path.join(dataDir, "ledger.db");
const db = new DatabaseSync(dbPath);

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    balance_paise INTEGER NOT NULL DEFAULT 0 CHECK (balance_paise >= 0),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
    amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
    description TEXT NOT NULL DEFAULT '',
    reference_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    UNIQUE (account_id, reference_id)
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_account_created
    ON transactions (account_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_transactions_account_type_created
    ON transactions (account_id, type, created_at DESC);

  CREATE TABLE IF NOT EXISTS transfers (
    id TEXT PRIMARY KEY,
    from_account_id TEXT NOT NULL,
    to_account_id TEXT NOT NULL,
    amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
    description TEXT NOT NULL DEFAULT '',
    reference_id TEXT NOT NULL UNIQUE,
    debit_transaction_id TEXT NOT NULL,
    credit_transaction_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (from_account_id) REFERENCES accounts(id),
    FOREIGN KEY (to_account_id) REFERENCES accounts(id),
    FOREIGN KEY (debit_transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (credit_transaction_id) REFERENCES transactions(id)
  );
`);

function migrateColumn(table, oldCol, newCol) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    const hasOld = cols.some((c) => c.name === oldCol);
    const hasNew = cols.some((c) => c.name === newCol);
    if (hasOld && !hasNew) {
      db.exec(`ALTER TABLE ${table} RENAME COLUMN ${oldCol} TO ${newCol}`);
    }
  } catch {
  }
}

migrateColumn("accounts", "balance_cents", "balance_paise");
migrateColumn("transactions", "amount_cents", "amount_paise");
migrateColumn("transfers", "amount_cents", "amount_paise");

let transactionDepth = 0;

export function withTransaction(fn) {
  if (transactionDepth > 0) {
    return fn();
  }

  db.exec("BEGIN IMMEDIATE");
  transactionDepth += 1;
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
    }
    throw error;
  } finally {
    transactionDepth -= 1;
  }
}

export function isUniqueConstraint(error) {
  const message = `${error?.errstr || ""} ${error?.message || ""}`;
  return message.includes("UNIQUE constraint failed");
}

export default db;

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_FILE = path.join(DATA_DIR, 'taskme.db');

let db: SqlJsDatabase | null = null;

export async function getDb(): Promise<SqlJsDatabase> {
  if (db) return db;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE)) {
    const fileBuffer = fs.readFileSync(DB_FILE);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  initTables(db);
  saveDb();
  return db;
}

export function saveDb(): void {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_FILE, buffer);
  } catch (err) {
    console.error('Failed to save database to disk:', err);
  }
}

function initTables(database: SqlJsDatabase): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar TEXT,
      role TEXT NOT NULL DEFAULT 'STUDENT',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS classrooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      description TEXT,
      image TEXT,
      join_code TEXT UNIQUE NOT NULL,
      owner_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS classroom_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      classroom_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      joined_at TEXT NOT NULL,
      UNIQUE(classroom_id, user_id),
      FOREIGN KEY (classroom_id) REFERENCES classrooms(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      classroom_id INTEGER NOT NULL,
      creator_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      deadline TEXT NOT NULL,
      attachment_name TEXT,
      attachment_url TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (classroom_id) REFERENCES classrooms(id),
      FOREIGN KEY (creator_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS task_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      UNIQUE(task_id, user_id),
      FOREIGN KEY (task_id) REFERENCES tasks(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      task_id INTEGER,
      classroom_id INTEGER,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
}

export function query<T = any>(sql: string, params: any[] = []): T[] {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  if (params.length > 0) {
    stmt.bind(params);
  }
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

export function queryOne<T = any>(sql: string, params: any[] = []): T | null {
  const rows = query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export function execute(sql: string, params: any[] = []): { lastInsertRowid: number; changes: number } {
  if (!db) throw new Error('Database not initialized');
  db.run(sql, params);

  const idRes = db.exec('SELECT last_insert_rowid()');
  const lastInsertRowid = (idRes[0]?.values[0]?.[0] as number) || 0;

  const changeRes = db.exec('SELECT changes()');
  const changes = (changeRes[0]?.values[0]?.[0] as number) || 0;

  saveDb();

  return { lastInsertRowid, changes };
}

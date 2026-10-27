import fs from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';

/**
 * 胶囊数据库连接封装。
 *
 * 使用 better-sqlite3 同步 API：所有写操作实时落盘（WAL 模式），
 * 无需再手动 persist()。启动时通过 PRAGMA user_version 顺序执行迁移。
 */
export interface CapsuleDatabase {
  db: BetterSqlite3.Database;
  close(): void;
}

/** 当前数据库 schema 版本号。 */
const SCHEMA_VERSION = 2;

/** 最新 schema（全新库直接按此创建）。 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS capsules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  content     TEXT    NOT NULL,
  color       TEXT    NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_capsules_sort ON capsules (sort_order ASC, id ASC);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/**
 * 迁移 v1 → v2：为旧库的 capsules 表补充 sort_order 列并回填。
 *
 * 旧实现（sql.js）可能已存在无 sort_order 列的表结构；这里以列是否存在
 * 作为判定依据，而非仅依赖 user_version，保证幂等。
 */
function migrateV1ToV2(db: BetterSqlite3.Database): void {
  const tableInfo = db.prepare('PRAGMA table_info(capsules)').all() as Array<{
    name: string;
  }>;
  const hasSortOrder = tableInfo.some((column) => column.name === 'sort_order');
  if (!hasSortOrder) {
    db.exec(
      'ALTER TABLE capsules ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;',
    );
    db.exec('UPDATE capsules SET sort_order = id WHERE sort_order = 0;');
  }
}

/**
 * 顺序执行迁移：根据当前 user_version 逐个提升到 SCHEMA_VERSION。
 */
function runMigrations(db: BetterSqlite3.Database): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  if (current < 1) {
    // v0 → v1：仅标记版本，无实际结构变更。
    db.pragma('user_version = 1');
  }
  if (current < 2) {
    migrateV1ToV2(db);
    db.pragma('user_version = 2');
  }
  if (current < SCHEMA_VERSION) {
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  }
}

/**
 * 打开（或创建）胶囊数据库。
 *
 * @param filePath SQLite 文件绝对路径。
 * @returns 已初始化、完成迁移的数据库封装。
 */
export function openCapsuleDatabase(filePath: string): CapsuleDatabase {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new BetterSqlite3(filePath);

  // WAL 提升写并发与崩溃恢复可靠性；foreign_keys 保持约束完整。
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(SCHEMA);
  runMigrations(db);

  return {
    db,
    close() {
      db.close();
    },
  };
}

/** 仅用于测试：创建内存数据库，避免磁盘残留。 */
export function openInMemoryDatabase(): CapsuleDatabase {
  const db = new BetterSqlite3(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  db.pragma('user_version = 2');
  return {
    db,
    close() {
      db.close();
    },
  };
}

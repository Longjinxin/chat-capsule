import {
  CAPSULE_COLORS,
  DEFAULT_SEARCH_LIMIT,
  MAX_CAPSULE_LENGTH,
  MAX_QUERY_LENGTH,
} from '../shared/constants';
import type { Capsule } from '../shared/types';
import type { CapsuleDatabase } from './database';

/** 转义 LIKE 特殊字符（! % _），配合 ESCAPE '!' 使用。 */
function escapeLike(value: string): string {
  return value.replace(/[!%_]/g, (match) => `!${match}`);
}

/** 将数据库行映射为 Capsule 实体。 */
function capsuleFromRow(row: Record<string, unknown>): Capsule {
  return {
    id: Number(row.id),
    content: String(row.content),
    color: String(row.color),
    sort_order: Number(row.sort_order ?? 0),
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
  };
}

/** 校验话术正文：非空且不超过最大长度。 */
function validateContent(content: string): void {
  if (!content.trim()) {
    throw new Error('话术内容不能为空');
  }
  if (content.length > MAX_CAPSULE_LENGTH) {
    throw new Error('话术内容过长');
  }
}

/** 根据当前胶囊总数轮换下一个颜色。 */
function nextColor(db: CapsuleDatabase['db']): string {
  const row = db
    .prepare('SELECT COUNT(*) AS count FROM capsules')
    .get() as { count: number };
  const count = Number(row.count ?? 0);
  return CAPSULE_COLORS[count % CAPSULE_COLORS.length];
}

/** 查询单个胶囊，不存在返回 null。 */
export function getCapsuleById(
  database: CapsuleDatabase,
  id: number,
): Capsule | null {
  const row = database.db
    .prepare(
      'SELECT id, content, color, sort_order, created_at, updated_at FROM capsules WHERE id = ?',
    )
    .get(id) as Record<string, unknown> | undefined;
  return row ? capsuleFromRow(row) : null;
}

/** 创建新胶囊：颜色按总数轮换，sort_order 置为最前（1）。 */
export function createCapsule(database: CapsuleDatabase, content: string): Capsule {
  validateContent(content);

  const now = Date.now();
  const color = nextColor(database.db);

  // 新胶囊插入列表最上方：在事务内将现有胶囊 sort_order 整体 +1，
  // 新胶囊占 sort_order = 1，保证最新新增的排在最前。
  const shift = database.db.prepare(
    'UPDATE capsules SET sort_order = sort_order + 1',
  );
  const insert = database.db.prepare(
    'INSERT INTO capsules (content, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  );
  const createTop = database.db.transaction(() => {
    shift.run();
    return insert.run(content, color, 1, now, now);
  });
  const result = createTop();
  const id = Number(result.lastInsertRowid);

  const capsule = getCapsuleById(database, id);
  if (!capsule) {
    throw new Error('新增话术失败');
  }
  return capsule;
}

/** 更新胶囊正文（编辑），保留颜色。 */
export function updateCapsuleContent(
  database: CapsuleDatabase,
  id: number,
  content: string,
): Capsule {
  validateContent(content);

  const result = database.db
    .prepare('UPDATE capsules SET content = ?, updated_at = ? WHERE id = ?')
    .run(content, Date.now(), id);
  if (result.changes === 0) {
    throw new Error('话术不存在');
  }

  const capsule = getCapsuleById(database, id);
  if (!capsule) {
    throw new Error('话术不存在');
  }
  return capsule;
}

/**
 * 替换胶囊正文（快捷键替换流程）。
 *
 * 与编辑的区别：本方法仅更新正文与更新时间，不改动颜色，
 * 语义上表达「用新选中文字覆盖旧话术」。实现与 updateCapsuleContent 一致，
 * 独立成方法以满足类图契约与未来差异化扩展。
 */
export function replaceCapsuleContent(
  database: CapsuleDatabase,
  id: number,
  content: string,
): Capsule {
  return updateCapsuleContent(database, id, content);
}

/**
 * 全文搜索胶囊正文。
 *
 * 使用参数化 LIKE，ESCAPE '!' 转义通配符；结果按 sort_order ASC, id ASC 排序。
 */
export function searchCapsules(
  database: CapsuleDatabase,
  query: string,
  limit: number = DEFAULT_SEARCH_LIMIT,
): Capsule[] {
  if (limit < 1) {
    return [];
  }
  const safeLimit = Math.min(limit, DEFAULT_SEARCH_LIMIT);
  const normalized = query.trim().slice(0, MAX_QUERY_LENGTH);
  const pattern = `%${escapeLike(normalized)}%`;

  const rows = database.db
    .prepare(
      "SELECT id, content, color, sort_order, created_at, updated_at FROM capsules WHERE content LIKE ? ESCAPE '!' ORDER BY sort_order ASC, id ASC LIMIT ?",
    )
    .all(pattern, safeLimit) as Array<Record<string, unknown>>;

  return rows.map(capsuleFromRow);
}

/** 删除胶囊，不存在时抛出错误。 */
export function deleteCapsule(database: CapsuleDatabase, id: number): void {
  const result = database.db
    .prepare('DELETE FROM capsules WHERE id = ?')
    .run(id);
  if (result.changes === 0) {
    throw new Error('话术不存在');
  }
}

/**
 * 手动排序：按给定 id 顺序重写 sort_order（1..n）。
 *
 * 用事务包裹，保证批量更新原子性。
 */
export function reorderCapsules(database: CapsuleDatabase, ids: number[]): void {
  const update = database.db.prepare(
    'UPDATE capsules SET sort_order = ? WHERE id = ?',
  );
  const reorder = database.db.transaction((idList: number[]) => {
    idList.forEach((id, index) => {
      update.run(index + 1, id);
    });
  });
  reorder(ids);
}

/** 统计胶囊总数。 */
export function countCapsules(database: CapsuleDatabase): number {
  const row = database.db
    .prepare('SELECT COUNT(*) AS count FROM capsules')
    .get() as { count: number };
  return Number(row.count ?? 0);
}

/** 导入结果统计。 */
export interface ImportResult {
  /** 成功新增的条数。 */
  added: number;
  /** 因内容完全相同而跳过的条数。 */
  skipped: number;
  /** 因空内容 / 超长等非法而失败的条数。 */
  failed: number;
}

/** 导出全部话术正文（按 sort_order 升序），返回内容字符串数组。 */
export function exportCapsuleContents(database: CapsuleDatabase): string[] {
  const rows = database.db
    .prepare('SELECT content FROM capsules ORDER BY sort_order ASC, id ASC')
    .all() as Array<{ content: string }>;
  return rows.map((row) => row.content);
}

/**
 * 批量导入话术（仅新增，不覆盖）。
 *
 * - 事务内批量写入，保证原子性；
 * - 追加到列表末尾（sort_order = 当前最大 + 1 + 序号）；
 * - 与现有话术「内容完全相同」的条目自动跳过（不重复添加）；
 * - 空内容 / 超长内容记为失败，跳过不写入。
 *
 * @param contents 待导入的话术正文数组（已由调用方解析）。
 */
export function importCapsules(
  database: CapsuleDatabase,
  contents: string[],
): ImportResult {
  const result: ImportResult = { added: 0, skipped: 0, failed: 0 };

  // 现有全部内容集合，用于去重（精确匹配）。
  const existingRows = database.db
    .prepare('SELECT content FROM capsules')
    .all() as Array<{ content: string }>;
  const existing = new Set(existingRows.map((row) => row.content));

  // 当前最大 sort_order，用于追加到末尾。
  const maxRow = database.db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM capsules')
    .get() as { max_order: number };
  const baseOrder = Number(maxRow.max_order ?? 0);

  const now = Date.now();
  const insert = database.db.prepare(
    'INSERT INTO capsules (content, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  );

  // 预筛选合法项，统计失败项（空/超长）。
  const valid: string[] = [];
  for (const content of contents) {
    if (typeof content !== 'string' || !content.trim()) {
      result.failed += 1;
      continue;
    }
    if (content.length > MAX_CAPSULE_LENGTH) {
      result.failed += 1;
      continue;
    }
    valid.push(content);
  }

  const colorCount = countCapsules(database);
  let colorIndex = colorCount;
  let orderOffset = 0;

  const importAll = database.db.transaction(() => {
    for (const content of valid) {
      // 去重：与现有话术内容完全相同则跳过。
      if (existing.has(content)) {
        result.skipped += 1;
        continue;
      }
      const color = CAPSULE_COLORS[colorIndex % CAPSULE_COLORS.length];
      insert.run(content, color, baseOrder + orderOffset + 1, now, now);
      // 记录已导入内容，避免同一批次内的重复项被重复插入。
      existing.add(content);
      result.added += 1;
      colorIndex += 1;
      orderOffset += 1;
    }
  });

  importAll();
  return result;
}

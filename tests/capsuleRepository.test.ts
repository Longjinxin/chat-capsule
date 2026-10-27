import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  countCapsules,
  createCapsule,
  deleteCapsule,
  exportCapsuleContents,
  importCapsules,
  reorderCapsules,
  replaceCapsuleContent,
  searchCapsules,
  updateCapsuleContent,
} from '../src/db/capsuleRepository';
import { openCapsuleDatabase } from '../src/db/database';
import type { CapsuleDatabase } from '../src/db/database';

describe('capsule repository', () => {
  let dir: string;
  let database: CapsuleDatabase;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capsule-test-'));
    database = openCapsuleDatabase(path.join(dir, 'capsules.sqlite'));
  });

  afterEach(() => {
    database.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates and searches a capsule', () => {
    const capsule = createCapsule(database, '你好，欢迎来面试');

    expect(capsule.id).toBeGreaterThan(0);
    expect(capsule.content).toBe('你好，欢迎来面试');
    expect(capsule.color).toBeTruthy();
    expect(capsule.sort_order).toBe(1);
    expect(capsule.created_at).toBeGreaterThan(0);
    expect(capsule.updated_at).toBe(capsule.created_at);

    const found = searchCapsules(database, '欢迎');
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(capsule.id);
    expect(found[0].content).toBe('你好，欢迎来面试');
  });

  it('returns results in manual order', () => {
    for (let index = 0; index < 6; index += 1) {
      createCapsule(database, `话术 ${index}`);
    }

    const results = searchCapsules(database, '话术');
    expect(results).toHaveLength(6);
    // 新增插入列表最上方：最后新增的「话术 5」排最前，「话术 0」排最后。
    expect(results[0].content).toBe('话术 5');
    expect(results[5].content).toBe('话术 0');
  });

  it('treats LIKE wildcards in the query as literal text', () => {
    createCapsule(database, '完成率 100%');

    const results = searchCapsules(database, '100%');
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('完成率 100%');
  });

  it('persists capsules across database reopen', () => {
    createCapsule(database, '跨重启数据');
    database.close();

    database = openCapsuleDatabase(path.join(dir, 'capsules.sqlite'));
    const found = searchCapsules(database, '跨重启');

    expect(found).toHaveLength(1);
    expect(found[0].content).toBe('跨重启数据');
  });

  it('rejects empty content', () => {
    expect(() => createCapsule(database, '   ')).toThrow('话术内容不能为空');
  });

  it('counts created capsules', () => {
    createCapsule(database, '第一条');
    createCapsule(database, '第二条');
    expect(countCapsules(database)).toBe(2);
  });

  it('updates capsule content and keeps its color', () => {
    const created = createCapsule(database, '旧话术内容');

    const updated = updateCapsuleContent(database, created.id, '新话术内容');

    expect(updated.id).toBe(created.id);
    expect(updated.content).toBe('新话术内容');
    expect(updated.color).toBe(created.color);
    expect(updated.updated_at).toBeGreaterThanOrEqual(created.updated_at);
    expect(searchCapsules(database, '新话术')).toHaveLength(1);
    expect(searchCapsules(database, '旧话术')).toHaveLength(0);
  });

  it('rejects updating a capsule that does not exist', () => {
    expect(() => updateCapsuleContent(database, 9999, '不存在')).toThrow('话术不存在');
  });

  it('replaces capsule content and preserves color', () => {
    const created = createCapsule(database, '旧话术');

    const replaced = replaceCapsuleContent(database, created.id, '新话术');

    expect(replaced.id).toBe(created.id);
    expect(replaced.content).toBe('新话术');
    expect(replaced.color).toBe(created.color);
    expect(searchCapsules(database, '新话术')).toHaveLength(1);
  });

  it('reorders capsules', () => {
    const first = createCapsule(database, '第一条');
    const second = createCapsule(database, '第二条');
    const third = createCapsule(database, '第三条');

    reorderCapsules(database, [third.id, first.id, second.id]);

    const results = searchCapsules(database, '');
    expect(results.map((capsule) => capsule.id)).toEqual([third.id, first.id, second.id]);
  });

  it('keeps sort_order globally unique after a full reorder', () => {
    // 回归测试（Bug 1）：验证排序后 sort_order 全局唯一。
    // 根因：过滤态下若把「子集 id」传给 reorderCapsules，会把子集重写为 1..n，
    // 未显示的胶囊保留旧 sort_order，与子集冲突（多胶囊共享同一序号）。
    // 修复为过滤态禁用拖拽（App 层 + persistOrder 防御），此处验证正常全量
    // 排序路径下序号始终唯一，作为回归护栏。
    const first = createCapsule(database, '第一条');
    const second = createCapsule(database, '第二条');
    const third = createCapsule(database, '第三条');
    const fourth = createCapsule(database, '第四条');

    reorderCapsules(database, [fourth.id, second.id, third.id, first.id]);

    const all = searchCapsules(database, '');
    const orders = all.map((capsule) => capsule.sort_order);
    expect(orders).toEqual([1, 2, 3, 4]);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('deletes a capsule', () => {
    const capsule = createCapsule(database, '待删除');
    deleteCapsule(database, capsule.id);

    expect(countCapsules(database)).toBe(0);
    expect(() => deleteCapsule(database, capsule.id)).toThrow('话术不存在');
  });

  it('exports capsule contents in sort order', () => {
    createCapsule(database, '第一条');
    createCapsule(database, '第二条');
    createCapsule(database, '第三条');

    // 新增插入最上方，导出应按 sort_order（最前到最旧）。
    expect(exportCapsuleContents(database)).toEqual(['第三条', '第二条', '第一条']);
  });

  it('imports new capsules by appending to the end', () => {
    createCapsule(database, '已有话术');

    const result = importCapsules(database, ['导入一', '导入二']);

    expect(result.added).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    // 追加到末尾：已有话术在前，导入的在后。
    expect(exportCapsuleContents(database)).toEqual(['已有话术', '导入一', '导入二']);
  });

  it('skips exact duplicates on import without overwriting', () => {
    createCapsule(database, '已有话术');

    const result = importCapsules(database, ['已有话术', '新话术']);

    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
    // 不覆盖、不重复：已有话术只保留一条。
    expect(countCapsules(database)).toBe(2);
    expect(exportCapsuleContents(database)).toEqual(['已有话术', '新话术']);
  });

  it('skips duplicate within the same import batch', () => {
    const result = importCapsules(database, ['相同话术', '相同话术']);

    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
    expect(countCapsules(database)).toBe(1);
  });

  it('counts empty contents as failed on import', () => {
    const result = importCapsules(database, ['正常话术', '   ', '']);

    expect(result.added).toBe(1);
    expect(result.failed).toBe(2);
    expect(countCapsules(database)).toBe(1);
  });
});

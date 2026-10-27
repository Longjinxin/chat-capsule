import { useCallback, useEffect, useRef, useState } from 'react';
import type { Capsule } from '../../shared/types';

/**
 * useCapsules：封装话术的搜索 / 增删改 / 排序状态。
 *
 * 统一管理胶囊列表状态与搜索关键词，所有数据操作经 window.capsuleApi
 * 与主进程通信，操作成功后自动刷新列表。
 */
export function useCapsules() {
  const [query, setQuery] = useState('');
  const [capsules, setCapsules] = useState<Capsule[]>([]);
  const capsulesRef = useRef<Capsule[]>(capsules);

  useEffect(() => {
    capsulesRef.current = capsules;
  }, [capsules]);

  /** 按当前关键词搜索（空关键词返回全部）。 */
  const runSearch = useCallback(async (value: string) => {
    const items = await window.capsuleApi.search(value);
    setCapsules(items);
  }, []);

  // 关键词变化时实时搜索。
  useEffect(() => {
    void runSearch(query);
  }, [query, runSearch]);

  // 主进程侧数据变更（如快捷键新增/替换）时刷新列表。
  useEffect(() => {
    return window.capsuleApi.onDataChanged(() => {
      void runSearch(query);
    });
  }, [query, runSearch]);

  /** 新增话术。 */
  const add = useCallback(
    async (content: string): Promise<Capsule> => {
      const capsule = await window.capsuleApi.add(content);
      await runSearch(query);
      return capsule;
    },
    [query, runSearch],
  );

  /** 编辑话术正文。 */
  const update = useCallback(
    async (id: number, content: string): Promise<Capsule> => {
      const capsule = await window.capsuleApi.update(id, content);
      await runSearch(query);
      return capsule;
    },
    [query, runSearch],
  );

  /** 替换话术正文（保留颜色）。 */
  const replace = useCallback(
    async (id: number, content: string): Promise<Capsule> => {
      const capsule = await window.capsuleApi.replace(id, content);
      await runSearch(query);
      return capsule;
    },
    [query, runSearch],
  );

  /** 删除话术。 */
  const remove = useCallback(
    async (id: number): Promise<void> => {
      await window.capsuleApi.remove(id);
      await runSearch(query);
    },
    [query, runSearch],
  );

  /** 本地即时调整顺序（拖拽过程中实时反映）。 */
  const moveLocal = useCallback((fromId: number, toId: number) => {
    const list = capsulesRef.current;
    const fromIndex = list.findIndex((capsule) => capsule.id === fromId);
    const toIndex = list.findIndex((capsule) => capsule.id === toId);
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }
    const next = [...list];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setCapsules(next);
  }, []);

  /** 按完整 id 数组直接重排本地状态（拖拽排序提交用）。 */
  const moveLocalByIds = useCallback((ids: number[]) => {
    const list = capsulesRef.current;
    const map = new Map(list.map((capsule) => [capsule.id, capsule]));
    const next = ids
      .map((id) => map.get(id))
      .filter((capsule): capsule is Capsule => Boolean(capsule));
    // 若 ids 长度与列表一致则直接替换；否则保持原列表兜底。
    if (next.length === list.length) {
      setCapsules(next);
    }
  }, []);

  /**
   * 拖拽结束后持久化顺序。
   *
   * 安全约束：仅在「非过滤态」下允许持久化。原因见 moveLocal 的注释 ——
   * 搜索过滤态下 capsules 是子集，若直接把子集 id 传给 reorderCapsules，
   * 未显示的胶囊会保留旧 sort_order，与子集重写后的 1..n 发生冲突
   * （多个胶囊共享同一 sort_order），清空搜索后列表顺序错乱。
   * 此处做防御性校验，正常流程下 App 层已在过滤态禁用拖拽入口。
   */
  const persistOrder = useCallback(
    async (ids?: number[]) => {
      const list = capsulesRef.current;
      if (query.trim() !== '' || list.length <= 1) {
        return;
      }
      const order = ids && ids.length === list.length ? ids : list.map((c) => c.id);
      await window.capsuleApi.reorder(order);
    },
    [query],
  );

  /** 是否允许拖拽排序：仅非过滤态（搜索框为空）时允许。 */
  const sortEnabled = query.trim() === '';

  return {
    query,
    setQuery,
    capsules,
    add,
    update,
    replace,
    remove,
    moveLocal,
    moveLocalByIds,
    persistOrder,
    sortEnabled,
  };
}

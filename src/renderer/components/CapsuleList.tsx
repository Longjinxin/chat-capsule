import { useRef } from 'react';
import type { Capsule } from '../../shared/types';
import CapsuleCard from './CapsuleCard';

interface CapsuleListProps {
  capsules: Capsule[];
  query: string;
  draggingId: number | null;
  replaceMode: boolean;
  sortDisabled: boolean;
  onSave: (id: number, content: string) => void;
  onInsert: (content: string, mode: 'drag' | 'click') => void;
  onReplace: (capsule: Capsule) => void;
  onDelete: (id: number) => void;
  onReorderStart: (id: number) => void;
  onReorderEnd: () => void;
  /** 拖拽结束时提交最终顺序（完整 id 数组）。 */
  onReorderCommit: (ids: number[]) => void;
}

interface ItemRect {
  id: number;
  el: HTMLElement;
  top: number;
  height: number;
}

/**
 * CapsuleList：话术列表容器，内置「实时跟随 + 连续让位」拖拽排序。
 *
 * 理想效果：拖住一条话术向上移动时，上方的话术会平滑地向下让位，
 * 而非「突然跳到下方」。实现要点：
 * - 拖拽期间 DOM 顺序保持不变，所有位移用 transform 表达；
 * - 被拖卡片 transform 跟随鼠标（浮起 + 缩放）；
 * - 其他卡片根据被拖卡片的「当前目标 index」实时计算让位偏移，平滑过渡；
 * - 松手时才真正调用 onReorderCommit 提交顺序。
 */
export default function CapsuleList({
  capsules,
  query,
  draggingId,
  replaceMode,
  sortDisabled,
  onSave,
  onInsert,
  onReplace,
  onDelete,
  onReorderStart,
  onReorderEnd,
  onReorderCommit,
}: CapsuleListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  // 拖拽实时状态（用 ref 避免频繁触发 React 重渲染，保证流畅）。
  const dragRef = useRef<{
    pointerId: number;
    activeId: number;
    items: ItemRect[];
    startY: number;
    // 当前被拖卡片的中心位置（用于计算让位目标 index）。
    currentY: number;
    // 各卡片相对其原始位置的让位偏移（以原始 index 为 key）。
    offsets: number[];
  } | null>(null);

  // 测量所有卡片的布局信息（用于让位计算）。
  function measureItems(): ItemRect[] {
    const container = listRef.current;
    if (!container) {
      return [];
    }
    const items: ItemRect[] = [];
    container.querySelectorAll<HTMLElement>('.capsule-card').forEach((el) => {
      const id = Number(el.dataset.capsuleId);
      if (!Number.isInteger(id)) {
        return;
      }
      items.push({
        id,
        el,
        top: el.offsetTop,
        height: el.offsetHeight,
      });
    });
    return items;
  }

  // 根据被拖卡片当前中心 Y 计算它在列表中的目标插入 index（0..n-1）。
  function targetIndexFromY(items: ItemRect[], activeId: number, y: number): number {
    const activeIdx = items.findIndex((item) => item.id === activeId);
    if (activeIdx < 0) {
      return 0;
    }
    // 计算「不包含被拖卡片」时，中心 Y 落在第几个卡片之后。
    let slot = 0;
    for (let i = 0; i < items.length; i++) {
      if (i === activeIdx) {
        continue;
      }
      const item = items[i];
      const mid = item.top + item.height / 2;
      if (y > mid) {
        slot += 1;
      }
    }
    // slot 即「插入到剩余 n-1 个卡片中的位置」，等价于最终 index。
    return Math.max(0, Math.min(items.length - 1, slot));
  }

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>, id: number): void {
    if (event.button !== 0 || sortDisabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);

    const items = measureItems();
    if (items.length <= 1) {
      return;
    }

    onReorderStart(id);
    const activeItem = items.find((item) => item.id === id);
    if (!activeItem) {
      return;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      activeId: id,
      items,
      startY: event.clientY,
      currentY: activeItem.top + activeItem.height / 2,
      offsets: items.map(() => 0),
    };

    // 被拖卡片初始浮起。
    activeItem.el.style.zIndex = '20';
    activeItem.el.style.transition = 'transform 0.12s ease, box-shadow 0.12s ease';
    activeItem.el.style.transform = 'scale(1.04)';
    activeItem.el.style.boxShadow = '0 12px 28px rgba(15,23,42,0.22)';

    const handleMove = (moveEvent: PointerEvent): void => {
      const state = dragRef.current;
      if (!state) {
        return;
      }
      const dy = moveEvent.clientY - state.startY;
      // 被拖卡片跟随鼠标（中心位置 = 原始中心 + dy）。
      state.currentY = state.items.find((it) => it.id === state.activeId)!.top
        + state.items.find((it) => it.id === state.activeId)!.height / 2
        + dy;
      const activeEl = state.items.find((it) => it.id === state.activeId)!.el;
      activeEl.style.transform = `translateY(${dy}px) scale(1.04)`;

      // 计算目标 index，并据此给其他卡片分配让位偏移。
      const target = targetIndexFromY(state.items, state.activeId, state.currentY);
      const activeIdx = state.items.findIndex((it) => it.id === state.activeId);

      const newOffsets = state.items.map((item, i) => {
        if (i === activeIdx) {
          return 0;
        }
        // 计算该卡片在「去掉被拖卡片」后的序号。
        const order = i < activeIdx ? i : i - 1;
        // 如果它的 order 位于让位区间，则让出一格。
        let shift = 0;
        if (activeIdx < target) {
          // 向下拖：中间卡片向上让一格。
          if (order >= activeIdx && order < target) {
            shift = -(item.height + 8); // 8 为 gap
          }
        } else if (activeIdx > target) {
          // 向上拖：中间卡片向下让一格。
          if (order >= target && order < activeIdx) {
            shift = item.height + 8;
          }
        }
        return shift;
      });

      state.offsets = newOffsets;

      // 应用让位偏移（平滑过渡）。
      state.items.forEach((item, i) => {
        if (i === activeIdx) {
          return;
        }
        const shift = newOffsets[i];
        const el = item.el;
        if (shift !== 0) {
          el.style.transition = 'transform 0.18s ease';
          el.style.transform = `translateY(${shift}px)`;
        } else {
          el.style.transition = 'transform 0.18s ease';
          el.style.transform = '';
        }
      });
    };

    const handleUp = (): void => {
      const state = dragRef.current;
      handle.removeEventListener('pointermove', handleMove);
      handle.removeEventListener('pointerup', handleUp);
      handle.removeEventListener('pointercancel', handleUp);
      if (handle.hasPointerCapture(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
      if (!state) {
        return;
      }

      // 计算最终顺序。
      const activeIdx = state.items.findIndex((it) => it.id === state.activeId);
      const target = targetIndexFromY(state.items, state.activeId, state.currentY);
      const order = state.items.map((it) => it.id);
      const [moved] = order.splice(activeIdx, 1);
      order.splice(target, 0, moved);

      // 清理所有内联 transform，交给 React 重排（重排后顺序一致，无跳变）。
      state.items.forEach((item) => {
        item.el.style.transition = '';
        item.el.style.transform = '';
        item.el.style.zIndex = '';
        item.el.style.boxShadow = '';
      });
      dragRef.current = null;
      onReorderEnd();
      onReorderCommit(order);
    };

    handle.addEventListener('pointermove', handleMove);
    handle.addEventListener('pointerup', handleUp);
    handle.addEventListener('pointercancel', handleUp);
  }

  return (
    <div className="capsule-list" ref={listRef}>
      {capsules.map((capsule) => (
        <CapsuleCard
          key={capsule.id}
          capsule={capsule}
          query={query}
          dragging={draggingId === capsule.id}
          replaceMode={replaceMode}
          sortDisabled={sortDisabled}
          onSave={onSave}
          onInsert={onInsert}
          onReplace={onReplace}
          onDelete={onDelete}
          onDragPointerDown={handlePointerDown}
        />
      ))}
    </div>
  );
}

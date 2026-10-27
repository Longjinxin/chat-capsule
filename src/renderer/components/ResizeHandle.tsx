import { useRef } from 'react';
import type { ResizeCorner } from '../../shared/types';

interface ResizeHandleProps {
  onResize: (corner: ResizeCorner, width: number, height: number) => void;
  onResizeEnd: () => void;
}

/** 四个角的缩放把手（左上/右上/左下/右下）。 */
const CORNERS: ResizeCorner[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
];

/**
 * ResizeHandle：四个角的缩放把手（Pointer Capture 实现）。
 *
 * 采用「绝对尺寸」模型，而非增量模型，彻底消除拖拽过程中的累积漂移：
 * - 拖动开始时记住起始窗口尺寸（CSS 像素）与鼠标起点；
 * - 每次 move 用「起始尺寸 + 位移」算出绝对目标尺寸，直接下发；
 * - 主进程据此直接 setBounds（不做 getBounds 叠加），单位统一、跟手。
 *
 * 每个角是透明热区，不渲染可见图标。
 */
export default function ResizeHandle({ onResize, onResizeEnd }: ResizeHandleProps) {
  const stateRef = useRef<{
    corner: ResizeCorner;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);

  function beginResize(
    corner: ResizeCorner,
    event: React.PointerEvent<HTMLDivElement>,
  ): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    stateRef.current = {
      corner,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: window.innerWidth,
      startHeight: window.innerHeight,
    };

    const handleMove = (moveEvent: PointerEvent): void => {
      const state = stateRef.current;
      if (!state) {
        return;
      }
      const dx = moveEvent.clientX - state.startX;
      const dy = moveEvent.clientY - state.startY;
      const left = state.corner.endsWith('left');
      const top = state.corner.startsWith('top');

      // 绝对目标尺寸：右边界拖动 → 宽 = 起始宽 + dx；左边界 → 起始宽 - dx。
      const width = state.startWidth + (left ? -dx : dx);
      const height = state.startHeight + (top ? -dy : dy);

      onResize(state.corner, width, height);
    };

    const handleUp = (): void => {
      handle.removeEventListener('pointermove', handleMove);
      handle.removeEventListener('pointerup', handleUp);
      handle.removeEventListener('pointercancel', handleUp);
      if (handle.hasPointerCapture(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
      stateRef.current = null;
      onResizeEnd();
    };

    handle.addEventListener('pointermove', handleMove);
    handle.addEventListener('pointerup', handleUp);
    handle.addEventListener('pointercancel', handleUp);
  }

  return (
    <>
      {CORNERS.map((corner) => (
        <div
          key={corner}
          className={`resize-handle resize-handle--${corner}`}
          onPointerDown={(event) => beginResize(corner, event)}
          aria-label="调整面板大小"
        />
      ))}
    </>
  );
}

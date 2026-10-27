import path from 'node:path';
import { BrowserWindow, screen } from 'electron';
import {
  PANEL_MAX_WORKAREA_RATIO,
  PANEL_MIN_HEIGHT,
  PANEL_MIN_WIDTH,
  WINDOW_MARGIN,
  WINDOW_SIZES,
} from '../shared/constants';
import type { LauncherSize } from '../shared/types';

export interface LauncherWindowOptions {
  preloadPath: string;
  rendererPath: string;
}

/** 将原生窗口句柄 Buffer 转为数值。 */
export function nativeWindowHandleToNumber(buffer: Buffer): number {
  if (buffer.length === 8) {
    return Number(buffer.readBigUInt64LE(0));
  }
  if (buffer.length === 4) {
    return buffer.readUInt32LE(0);
  }
  return 0;
}

/**
 * 创建启动器主窗口（收起态胶囊）。
 *
 * 默认右上角，始终置顶，focusable:false + showInactive 降低抢焦点风险。
 */
export function createLauncherWindow(options: LauncherWindowOptions): BrowserWindow {
  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;
  const compact = WINDOW_SIZES.compact;

  const window = new BrowserWindow({
    width: compact.width,
    height: compact.height,
    x: workArea.x + workArea.width - compact.width - WINDOW_MARGIN,
    y: workArea.y + WINDOW_MARGIN,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.resolve(options.preloadPath),
      contextIsolation: true,
      nodeIntegration: false,
      // preload 需 require 相对路径模块（../shared/ipc），必须关闭 sandbox。
      // contextIsolation: true + nodeIntegration: false 已保证渲染层安全。
      sandbox: false,
    },
  });

  window.setAlwaysOnTop(true, 'floating');
  window.once('ready-to-show', () => {
    window.setBounds({
      x: workArea.x + workArea.width - compact.width - WINDOW_MARGIN,
      y: workArea.y + WINDOW_MARGIN,
      width: compact.width,
      height: compact.height,
    });
    window.showInactive();
  });
  void window.loadFile(path.resolve(options.rendererPath));
  return window;
}

/** 创建 Tooltip 提示窗口（收起态悬停时显示）。 */
export function createTooltipWindow(rendererPath: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 160,
    height: 48,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.setAlwaysOnTop(true, 'floating');
  void window.loadFile(path.resolve(rendererPath), { query: { tooltip: '1' } });
  return window;
}

/**
 * 切换启动器尺寸（收起 / 展开）。
 *
 * 展开时恢复上一次记忆的尺寸（由 renderer 传入），收起时回到 92×36。
 * 展开态可自由缩放（最小 280×240），收起态不可缩放。
 */
export function setLauncherSize(
  window: BrowserWindow,
  size: LauncherSize,
  height?: number,
  width?: number,
): void {
  const bounds = window.getBounds();
  const target = WINDOW_SIZES[size];
  window.setResizable(size === 'expanded');
  if (size === 'expanded') {
    // 展开态：自由缩放，最小 320×240，最大限制为工作区一半（与 resize 逻辑一致）。
    const display = screen.getDisplayMatching(bounds);
    const maxWidth = Math.round(display.workArea.width * PANEL_MAX_WORKAREA_RATIO);
    const maxHeight = Math.round(display.workArea.height * PANEL_MAX_WORKAREA_RATIO);
    window.setMinimumSize(PANEL_MIN_WIDTH, PANEL_MIN_HEIGHT);
    window.setMaximumSize(maxWidth, maxHeight);
  } else {
    // 收起态：锁定为胶囊尺寸 92×36，不可缩放。
    window.setMinimumSize(target.width, target.height);
    window.setMaximumSize(target.width, target.height);
  }

  const targetWidth =
    size === 'expanded' && typeof width === 'number'
      ? Math.max(PANEL_MIN_WIDTH, Math.round(width))
      : target.width;
  const targetHeight =
    size === 'expanded' && typeof height === 'number'
      ? Math.max(PANEL_MIN_HEIGHT, Math.round(height))
      : target.height;

  // 展开态额外限制最大尺寸（防止记忆的尺寸超过半个桌面）。
  let finalWidth = targetWidth;
  let finalHeight = targetHeight;
  if (size === 'expanded') {
    const display = screen.getDisplayMatching(bounds);
    finalWidth = Math.min(
      Math.round(display.workArea.width * PANEL_MAX_WORKAREA_RATIO),
      targetWidth,
    );
    finalHeight = Math.min(
      Math.round(display.workArea.height * PANEL_MAX_WORKAREA_RATIO),
      targetHeight,
    );
  }

  // 位置计算：展开时保持右上角锚定（窗口默认停靠屏幕右上角），
  // 但必须 clamp 到工作区内，防止窗口被推到屏幕外看不见。
  let x = bounds.x + bounds.width - finalWidth;
  let y = bounds.y;

  const display = screen.getDisplayMatching({
    x,
    y,
    width: finalWidth,
    height: finalHeight,
  });
  const area = display.workArea;
  x = Math.min(Math.max(x, area.x), area.x + area.width - finalWidth);
  y = Math.min(Math.max(y, area.y), area.y + area.height - finalHeight);

  window.setBounds({
    x,
    y,
    width: finalWidth,
    height: finalHeight,
  });
}

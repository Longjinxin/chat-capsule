import { globalShortcut } from 'electron';
import type { BrowserWindow } from 'electron';
import { HOTKEY_KINDS } from '../shared/constants';
import * as IPC from '../shared/ipc';
import type { AppSettings, HotkeyKind } from '../shared/types';

/** 单个快捷键注册结果。 */
export interface ShortcutResult {
  name: HotkeyKind;
  accelerator: string;
  registered: boolean;
}

/** 快捷键功能键 → 设置字段映射。 */
const HOTKEY_FIELD: Record<HotkeyKind, 'globalHotkeyOpen' | 'globalHotkeyAdd' | 'globalHotkeyReplace'> = {
  open: 'globalHotkeyOpen',
  add: 'globalHotkeyAdd',
  replace: 'globalHotkeyReplace',
};

/** 功能键对应的中文名（用于提示）。 */
export const HOTKEY_LABEL: Record<HotkeyKind, string> = {
  open: '唤起',
  add: '新增',
  replace: '替换',
};

/** 校验 accelerator 是否为非空字符串。 */
function isValidAccelerator(accelerator: string): boolean {
  return typeof accelerator === 'string' && accelerator.trim().length > 0;
}

/**
 * 切换启动器可见状态：可见则隐藏，不可见则显示并聚焦。
 */
export function toggleLauncher(window: BrowserWindow, onShow?: () => void): void {
  if (window.isVisible()) {
    window.hide();
    return;
  }
  onShow?.();
  window.show();
  window.focus();
  window.webContents.send(IPC.IPC_CAPSULE_GLOBAL_OPEN);
}

/**
 * 注册三个全局快捷键（唤起 / 新增 / 替换）。
 *
 * 返回每个键的注册结果；未成功注册的键（冲突）由调用方提示。
 */
export function registerGlobalShortcuts(
  window: BrowserWindow,
  settings: AppSettings,
  callbacks: Partial<Record<HotkeyKind, () => void>> = {},
  onShow?: () => void,
): ShortcutResult[] {
  const results: ShortcutResult[] = [];

  for (const kind of HOTKEY_KINDS) {
    const accelerator = settings[HOTKEY_FIELD[kind]];
    const handler =
      kind === 'open'
        ? () => toggleLauncher(window, onShow)
        : (callbacks[kind] ?? (() => undefined));

    let registered = false;
    if (isValidAccelerator(accelerator)) {
      registered = globalShortcut.register(accelerator, handler);
    }
    results.push({ name: kind, accelerator, registered });
  }

  return results;
}

/** 注销全部全局快捷键。 */
export function unregisterAllShortcuts(): void {
  globalShortcut.unregisterAll();
}

/**
 * 尝试重新注册单个快捷键，返回是否成功。
 *
 * 用于设置面板自定义快捷键时即时校验冲突。
 */
export function registerSingleShortcut(
  _kind: HotkeyKind,
  accelerator: string,
  handler: () => void,
): { registered: boolean } {
  if (!isValidAccelerator(accelerator)) {
    return { registered: false };
  }
  const registered = globalShortcut.register(accelerator, handler);
  return { registered };
}

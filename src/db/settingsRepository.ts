import { DEFAULT_SETTINGS, SETTING_KEYS } from '../shared/constants';
import type { AppSettings } from '../shared/types';
import type { CapsuleDatabase } from './database';

/** 初始化默认设置：仅对缺失的 key 插入默认值，不覆盖已有配置。 */
export function initializeSettings(database: CapsuleDatabase): void {
  const stmt = database.db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
  );
  for (const key of SETTING_KEYS) {
    stmt.run(key, DEFAULT_SETTINGS[key]);
  }
}

/** 读取单个设置，不存在返回 null。 */
export function getSetting(
  database: CapsuleDatabase,
  key: string,
): string | null {
  const row = database.db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row ? String(row.value) : null;
}

/** 写入（或覆盖）单个设置。 */
export function setSetting(
  database: CapsuleDatabase,
  key: string,
  value: string,
): void {
  database.db
    .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run(key, value);
}

/** 解析 window_position（"x,y" 字符串 → {x, y} | null）。 */
function parseWindowPosition(
  value: string | null,
): AppSettings['windowPosition'] {
  if (!value) {
    return null;
  }
  const parts = value.split(',').map(Number);
  if (parts.length !== 2 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }
  return { x: parts[0], y: parts[1] };
}

/** 聚合所有设置为 AppSettings 对象。 */
export function getAppSettings(database: CapsuleDatabase): AppSettings {
  return {
    globalHotkeyOpen:
      getSetting(database, 'global_hotkey_open') ??
      DEFAULT_SETTINGS.global_hotkey_open,
    globalHotkeyAdd:
      getSetting(database, 'global_hotkey_add') ??
      DEFAULT_SETTINGS.global_hotkey_add,
    globalHotkeyReplace:
      getSetting(database, 'global_hotkey_replace') ??
      DEFAULT_SETTINGS.global_hotkey_replace,
    alwaysOnTop: getSetting(database, 'always_on_top') === 'true',
    launchOnStartup: getSetting(database, 'launch_on_startup') === 'true',
    windowPosition: parseWindowPosition(getSetting(database, 'window_position')),
  };
}

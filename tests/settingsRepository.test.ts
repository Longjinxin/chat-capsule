import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openCapsuleDatabase } from '../src/db/database';
import type { CapsuleDatabase } from '../src/db/database';
import {
  getAppSettings,
  getSetting,
  initializeSettings,
  setSetting,
} from '../src/db/settingsRepository';

describe('settings repository', () => {
  let dir: string;
  let database: CapsuleDatabase;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-test-'));
    database = openCapsuleDatabase(path.join(dir, 'settings.sqlite'));
    initializeSettings(database);
  });

  afterEach(() => {
    database.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('inserts default settings', () => {
    expect(getSetting(database, 'global_hotkey_open')).toBe('Ctrl+Alt+Space');
    expect(getSetting(database, 'global_hotkey_add')).toBe('Ctrl+Shift+C');
    expect(getSetting(database, 'global_hotkey_replace')).toBe('Ctrl+Alt+R');

    const settings = getAppSettings(database);
    expect(settings.alwaysOnTop).toBe(true);
    expect(settings.launchOnStartup).toBe(false);
    expect(settings.windowPosition).toBeNull();
  });

  it('updates an existing setting', () => {
    setSetting(database, 'global_hotkey_open', 'Ctrl+Alt+Space');
    expect(getSetting(database, 'global_hotkey_open')).toBe('Ctrl+Alt+Space');
    expect(getAppSettings(database).globalHotkeyOpen).toBe('Ctrl+Alt+Space');
  });
});

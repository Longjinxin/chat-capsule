import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  unregisterAll: vi.fn(),
}));

vi.mock('electron', () => ({
  globalShortcut: {
    register: mocks.register,
    unregisterAll: mocks.unregisterAll,
  },
}));

import { registerGlobalShortcuts, toggleLauncher } from '../src/main/shortcuts';
import type { AppSettings } from '../src/shared/types';

const settings: AppSettings = {
  globalHotkeyOpen: 'Ctrl+Alt+Space',
  globalHotkeyAdd: 'Ctrl+Shift+C',
  globalHotkeyReplace: 'Ctrl+Alt+R',
  alwaysOnTop: true,
  launchOnStartup: false,
  windowPosition: null,
};

describe('global shortcuts', () => {
  it('registers all three configured shortcuts', () => {
    mocks.register.mockReturnValue(true);
    const windowStub = {} as never;

    const results = registerGlobalShortcuts(windowStub, settings);

    expect(mocks.register).toHaveBeenCalledTimes(3);
    expect(mocks.register).toHaveBeenCalledWith('Ctrl+Alt+Space', expect.any(Function));
    expect(mocks.register).toHaveBeenCalledWith('Ctrl+Shift+C', expect.any(Function));
    expect(mocks.register).toHaveBeenCalledWith('Ctrl+Alt+R', expect.any(Function));
    expect(results).toEqual([
      { name: 'open', accelerator: 'Ctrl+Alt+Space', registered: true },
      { name: 'add', accelerator: 'Ctrl+Shift+C', registered: true },
      { name: 'replace', accelerator: 'Ctrl+Alt+R', registered: true },
    ]);
  });

  it('reports shortcut conflicts', () => {
    mocks.register.mockReturnValue(false);
    const windowStub = {} as never;

    const results = registerGlobalShortcuts(windowStub, settings);

    expect(results[0].registered).toBe(false);
  });

  it('shows and focuses the launcher on global open', () => {
    const show = vi.fn();
    const hide = vi.fn();
    const focus = vi.fn();
    const send = vi.fn();
    const isVisible = vi.fn(() => false);
    const windowStub = {
      show,
      hide,
      focus,
      isVisible,
      webContents: { send },
    };

    toggleLauncher(windowStub as never);

    expect(show).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith('capsule:global-open');
    expect(hide).not.toHaveBeenCalled();
  });

  it('hides the launcher when already visible', () => {
    const hide = vi.fn();
    const show = vi.fn();
    const isVisible = vi.fn(() => true);
    const windowStub = { hide, show, isVisible, webContents: { send: vi.fn() } };

    toggleLauncher(windowStub as never);

    expect(hide).toHaveBeenCalled();
    expect(show).not.toHaveBeenCalled();
  });
});

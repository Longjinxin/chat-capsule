import { beforeEach, describe, expect, it, vi } from 'vitest';

const execFileMock = vi.hoisted(() => vi.fn());
const clipboardMocks = vi.hoisted(() => ({
  readText: vi.fn(),
  readHTML: vi.fn(),
  readImage: vi.fn(),
  readRTF: vi.fn(),
  writeText: vi.fn(),
  write: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}));

vi.mock('electron', () => ({
  clipboard: clipboardMocks,
}));

import { InsertEngine } from '../src/main/insertion';

describe('InsertEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clipboardMocks.readText.mockReturnValue('原始剪贴板');
    clipboardMocks.readHTML.mockReturnValue('');
    clipboardMocks.readImage.mockReturnValue({ isEmpty: () => true });
    clipboardMocks.readRTF.mockReturnValue('');
    execFileMock.mockImplementation(
      (
        _file: unknown,
        _args: unknown,
        _options: unknown,
        callback: (error: Error | null, result: { stdout: string }) => void,
      ) => {
        callback(null, { stdout: '' });
      },
    );
  });

  it('writes text, sends Ctrl+V, and restores the original clipboard', async () => {
    const engine = new InsertEngine();

    const ok = await engine.insert('话术内容', 12345);

    expect(ok).toBe(true);
    expect(clipboardMocks.writeText).toHaveBeenCalledWith('话术内容');
    expect(execFileMock).toHaveBeenCalledTimes(1);
    expect(clipboardMocks.write).toHaveBeenCalledWith(
      expect.objectContaining({ text: '原始剪贴板' }),
    );
  });

  it('passes the target window to Ctrl+V injection', async () => {
    const engine = new InsertEngine();

    await engine.insert('话术内容', 12345);

    const env = execFileMock.mock.calls[0][2].env;
    expect(env.CAPSULE_TARGET_HWND).toBe('12345');
  });

  it('uses cursor-based targeting when no target window is given', async () => {
    const engine = new InsertEngine();

    await engine.insert('话术内容', null);

    const env = execFileMock.mock.calls[0][2].env;
    expect(env.CAPSULE_TARGET_HWND).toBe('0');
  });

  it('restores clipboard and returns false on failure', async () => {
    execFileMock.mockImplementation(
      (
        _file: unknown,
        _args: unknown,
        _options: unknown,
        callback: (error: Error) => void,
      ) => {
        callback(new Error('injection failed'));
      },
    );

    const engine = new InsertEngine();
    const ok = await engine.insert('话术内容', 12345);

    expect(ok).toBe(false);
    expect(clipboardMocks.write).toHaveBeenCalledWith(
      expect.objectContaining({ text: '原始剪贴板' }),
    );
  });
});

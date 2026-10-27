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

import { SelectionCapture } from '../src/main/selectionCapture';
import { ClipboardService } from '../src/main/clipboard';

describe('SelectionCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clipboardMocks.readText.mockReturnValue('选中文本');
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

  it('captures the selected text and restores the clipboard', async () => {
    const capture = new SelectionCapture();

    // 模拟「抓取前剪贴板为空 → Ctrl+C 后出现选中文本」。
    // capture() 读到的旧值是 ''，轮询阶段读到的才是选中文本。
    let readCount = 0;
    clipboardMocks.readText.mockImplementation(() => {
      readCount += 1;
      return readCount <= 1 ? '' : '选中文本';
    });

    const text = await capture.captureSelection();

    expect(text).toBe('选中文本');
    expect(execFileMock).toHaveBeenCalledTimes(1);
    expect(clipboardMocks.write).toHaveBeenCalled();
  });

  it('returns null when there is no selected text', async () => {
    // 剪贴板始终为空：Ctrl+C 未产生新内容 → 轮询超时返回 null。
    clipboardMocks.readText.mockReturnValue('');

    const capture = new SelectionCapture();
    const text = await capture.captureSelection();

    expect(text).toBeNull();
  });

  it('restores the clipboard snapshot', async () => {
    const clipboard = new ClipboardService();
    const capture = new SelectionCapture(clipboard);

    await capture.captureSelection();

    // 恢复调用将原快照写回。
    expect(clipboardMocks.write).toHaveBeenCalledWith(
      expect.objectContaining({ text: '选中文本' }),
    );
  });

  it('returns null on injection failure and still restores clipboard', async () => {
    execFileMock.mockImplementation(
      (
        _file: unknown,
        _args: unknown,
        _options: unknown,
        callback: (error: Error) => void,
      ) => {
        callback(new Error('copy failed'));
      },
    );

    const capture = new SelectionCapture();
    const text = await capture.captureSelection();

    expect(text).toBeNull();
    expect(clipboardMocks.write).toHaveBeenCalled();
  });
});

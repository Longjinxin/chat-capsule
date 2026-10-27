import { describe, expect, it } from 'vitest';
import { parseForegroundLine } from '../src/main/targetWindowTracker';

describe('TargetWindowTracker foreground parsing', () => {
  it('records a foreground window that is not the capsule', () => {
    const target = parseForegroundLine(
      JSON.stringify({
        hwnd: 12345,
        processId: 678,
        processName: 'notepad',
        title: '目标窗口',
        timestamp: 1000,
      }),
      999,
    );

    expect(target).toEqual({
      hwnd: 12345,
      processId: 678,
      processName: 'notepad',
      title: '目标窗口',
      timestamp: 1000,
    });
  });

  it('ignores the capsule window itself', () => {
    expect(
      parseForegroundLine(
        JSON.stringify({
          hwnd: 12345,
          processId: 1,
          processName: 'electron',
          title: '聊天胶囊',
          timestamp: 1000,
        }),
        12345,
      ),
    ).toBeNull();
  });

  it('ignores invalid or empty foreground entries', () => {
    expect(parseForegroundLine('not-json', null)).toBeNull();
    expect(
      parseForegroundLine(
        JSON.stringify({ hwnd: 0, processId: 0, processName: '', title: '', timestamp: 0 }),
        null,
      ),
    ).toBeNull();
  });
});

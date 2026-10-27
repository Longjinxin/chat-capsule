import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { ClipboardService } from './clipboard';

const execFileAsync = promisify(execFile);

/** 模拟 Ctrl+C 抓取当前选中文本的 PowerShell 脚本。 */
const SEND_CTRL_C_SCRIPT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class CapsuleNativeCopy {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
[CapsuleNativeCopy]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero)
[CapsuleNativeCopy]::keybd_event(0x43, 0, 0, [UIntPtr]::Zero)
[CapsuleNativeCopy]::keybd_event(0x43, 0, 2, [UIntPtr]::Zero)
[CapsuleNativeCopy]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero)
`;

function encodePowerShell(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function getPowerShellPath(): string {
  if (process.env.SystemRoot) {
    return path.join(
      process.env.SystemRoot,
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    );
  }
  return 'powershell.exe';
}

/**
 * SelectionCapture：抓取当前系统中用户选中的文本。
 *
 * 流程（P0-2 / P0-5）：
 *   保存剪贴板 → 模拟 Ctrl+C → 读剪贴板 → 恢复剪贴板。
 * 若未选中任何文本（剪贴板内容未变化），返回 null 表示抓取失败。
 */
export class SelectionCapture {
  private readonly clipboard: ClipboardService;

  constructor(clipboard: ClipboardService = new ClipboardService()) {
    this.clipboard = clipboard;
  }

  /** 抓取当前选中文本；无选中文本时返回 null。 */
  async captureSelection(): Promise<string | null> {
    const snapshot = this.clipboard.capture();
    const beforeText = snapshot.text;

    try {
      await this.sendCtrlC();
      // 轮询等待剪贴板出现新文本（目标应用响应 Ctrl+C 耗时不定，
      // 冷启动 PowerShell + 目标应用复制可能远超固定延迟；固定 120ms 不可靠）。
      const text = await this.waitForClipboardChange(beforeText);
      if (!text) {
        return null;
      }
      return text;
    } catch {
      return null;
    } finally {
      // 无论成败，恢复原剪贴板。
      this.clipboard.restore(snapshot);
    }
  }

  /**
   * 轮询剪贴板，直到其文本相对 beforeText 发生变化（或超时）。
   *
   * 每 40ms 检查一次，最长等待 800ms。若剪贴板文本与抓取前一致
   * （未选中任何文本，Ctrl+C 未产生新内容），返回 null。
   */
  private async waitForClipboardChange(beforeText: string): Promise<string | null> {
    const deadline = Date.now() + 800;
    while (Date.now() < deadline) {
      const current = this.clipboard.readText();
      if (current && current !== beforeText) {
        return current;
      }
      await delay(40);
    }
    return null;
  }

  /** 模拟 Ctrl+C 按键。 */
  private async sendCtrlC(): Promise<void> {
    const encoded = encodePowerShell(SEND_CTRL_C_SCRIPT);
    await execFileAsync(
      getPowerShellPath(),
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      {
        windowsHide: true,
        timeout: 5000,
      },
    );
  }
}

/** 可注入的延迟工具（便于测试控制时序）。 */
export function delay(milliseconds: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

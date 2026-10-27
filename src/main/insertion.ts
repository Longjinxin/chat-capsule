import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { ClipboardService } from './clipboard';

const execFileAsync = promisify(execFile);

/** 模拟 Ctrl+V 注入文本到目标窗口的 PowerShell 脚本。 */
const SEND_CTRL_V_SCRIPT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class CapsuleNativePaste {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT lpPoint);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
}
"@
$target = [IntPtr]::Zero
$raw = $env:CAPSULE_TARGET_HWND
if ($raw -and $raw -ne '0') {
  try { $target = [IntPtr][int64]$raw } catch { $target = [IntPtr]::Zero }
}
if ($target -eq [IntPtr]::Zero) {
  $point = New-Object CapsuleNativePaste+POINT
  [CapsuleNativePaste]::GetCursorPos([ref]$point) | Out-Null
  $target = [CapsuleNativePaste]::WindowFromPoint($point)
}
if ($target -ne [IntPtr]::Zero) {
  [CapsuleNativePaste]::SetForegroundWindow($target) | Out-Null
  Start-Sleep -Milliseconds 80
  [CapsuleNativePaste]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero)
  [CapsuleNativePaste]::keybd_event(0x56, 0, 0, [UIntPtr]::Zero)
  [CapsuleNativePaste]::keybd_event(0x56, 0, 2, [UIntPtr]::Zero)
  [CapsuleNativePaste]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero)
}
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
 * InsertEngine：统一执行 Clipboard + Ctrl+V 注入。
 *
 * 六步流程（P0-4）：
 *   保存剪贴板 → 写文本 → 隐藏/失焦胶囊 → 恢复目标窗口 → Ctrl+V → 恢复剪贴板。
 * 不自动发送；失败不抛异常，返回 false 交由调用方提示。
 */
export class InsertEngine {
  private readonly clipboard: ClipboardService;

  constructor(clipboard: ClipboardService = new ClipboardService()) {
    this.clipboard = clipboard;
  }

  /**
   * 注入文本到目标窗口。
   *
   * @param text 要注入的话术正文。
   * @param targetWindowId 目标窗口句柄；为 null 时回退到鼠标光标所在窗口。
   * @returns 是否注入成功（不抛异常）。
   */
  async insert(text: string, targetWindowId: number | null): Promise<boolean> {
    const snapshot = this.clipboard.capture();
    this.clipboard.writeText(text);

    try {
      await this.sendCtrlV(targetWindowId);
      // 延迟以确保目标应用完成粘贴后再恢复剪贴板，避免竞态。
      await delay(300);
      return true;
    } catch {
      return false;
    } finally {
      this.clipboard.restore(snapshot);
    }
  }

  /** 模拟 Ctrl+V。 */
  private async sendCtrlV(targetWindowId: number | null): Promise<void> {
    const encoded = encodePowerShell(SEND_CTRL_V_SCRIPT);
    await execFileAsync(
      getPowerShellPath(),
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      {
        windowsHide: true,
        timeout: 8000,
        env: {
          ...process.env,
          CAPSULE_TARGET_HWND: targetWindowId ? String(targetWindowId) : '0',
        },
      },
    );
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

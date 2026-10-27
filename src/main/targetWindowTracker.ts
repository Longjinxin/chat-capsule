import { spawn, type ChildProcessByStdio } from 'node:child_process';
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { TargetWindow } from '../shared/types';

const POLL_FOREGROUND_SCRIPT = `
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class CapsuleFgTracker {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
"@
while ($true) {
  try {
    $hwnd = [CapsuleFgTracker]::GetForegroundWindow()
    $processIdValue = [uint32]0
    [CapsuleFgTracker]::GetWindowThreadProcessId($hwnd, [ref]$processIdValue) | Out-Null
    $titleBuilder = New-Object System.Text.StringBuilder 512
    [CapsuleFgTracker]::GetWindowText($hwnd, $titleBuilder, $titleBuilder.Capacity) | Out-Null
    $processName = ''
    if ($processIdValue -gt 0) {
      try { $processName = (Get-Process -Id $processIdValue -ErrorAction Stop).ProcessName } catch {}
    }
    $entry = @{
      hwnd = $hwnd.ToInt64()
      processId = $processIdValue
      processName = $processName
      title = $titleBuilder.ToString()
      timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    }
    Write-Output ($entry | ConvertTo-Json -Compress)
  } catch {}
  Start-Sleep -Milliseconds 150
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
 * 解析前台窗口轮询输出的一行 JSON，得到目标窗口（或 null）。
 *
 * 纯函数，便于单元测试。
 */
export function parseForegroundLine(
  line: string,
  selfHwnd: number | null,
): TargetWindow | null {
  try {
    const entry = JSON.parse(line) as {
      hwnd?: unknown;
      processId?: unknown;
      processName?: unknown;
      title?: unknown;
      timestamp?: unknown;
    };
    const hwnd = Number(entry.hwnd);
    if (!Number.isFinite(hwnd) || hwnd === 0 || hwnd === selfHwnd) {
      return null;
    }
    return {
      hwnd,
      processId: Number(entry.processId ?? 0),
      processName: String(entry.processName ?? ''),
      title: String(entry.title ?? ''),
      timestamp: Number(entry.timestamp ?? 0),
    };
  } catch {
    return null;
  }
}

/**
 * TargetWindowTracker：持续监听前台窗口，记录最近一个「非胶囊自身窗口」。
 *
 * 通过常驻 PowerShell 子进程轮询前台窗口（150ms），过滤胶囊自身与 Tooltip
 * 窗口，保留最近目标，供 InsertEngine 在插入时恢复焦点。
 */
export class TargetWindowTracker {
  private process: ChildProcessByStdio<null, Readable, null> | null = null;
  private buffer = '';
  private selfHwnds = new Set<number>();
  private target: TargetWindow | null = null;

  /** 设置（替换）自身窗口句柄集合。 */
  setSelfWindowHwnd(hwnd: number | null): void {
    this.selfHwnds.clear();
    if (hwnd !== null) {
      this.selfHwnds.add(hwnd);
    }
  }

  /** 追加自身窗口句柄（如 Tooltip 窗口）。 */
  addSelfWindowHwnd(hwnd: number): void {
    this.selfHwnds.add(hwnd);
  }

  /** 获取最近记录的非自身目标窗口。 */
  getTargetWindow(): TargetWindow | null {
    return this.target;
  }

  /** 启动轮询（幂等，已在运行则不重复启动）。 */
  start(): void {
    if (this.process) {
      return;
    }
    const child = spawn(
      getPowerShellPath(),
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShell(POLL_FOREGROUND_SCRIPT)],
      {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      this.buffer += chunk;
      const lines = this.buffer.split(/\r?\n/);
      this.buffer = lines.pop() ?? '';
      for (const line of lines) {
        const parsed = parseForegroundLine(line.trim(), null);
        if (parsed && !this.selfHwnds.has(parsed.hwnd)) {
          this.target = parsed;
        }
      }
    });
    child.on('exit', () => {
      this.process = null;
      // 子进程意外退出后自动重启。
      setTimeout(() => this.start(), 1000);
    });
    this.process = child;
  }

  /** 停止轮询。 */
  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

import path from 'node:path';
import fs from 'node:fs';
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, screen } from 'electron';

// 禁用 GPU 硬件加速，规避无显卡/远程桌面/驱动异常环境下
// GPU 进程反复崩溃导致的「FATAL: GPU process isn't usable」整进程退出。
// 本应用为轻量悬浮窗，纯软件渲染性能完全够用。
app.disableHardwareAcceleration();
import {
  createCapsule,
  deleteCapsule,
  exportCapsuleContents,
  importCapsules,
  reorderCapsules,
  replaceCapsuleContent,
  searchCapsules,
  updateCapsuleContent,
} from '../db/capsuleRepository';
import type { CapsuleDatabase } from '../db/database';
import { openCapsuleDatabase } from '../db/database';
import {
  getAppSettings,
  getSetting,
  initializeSettings,
  setSetting,
} from '../db/settingsRepository';
import {
  HOTKEY_KINDS,
  PANEL_MAX_WORKAREA_RATIO,
  PANEL_MIN_HEIGHT,
  PANEL_MIN_WIDTH,
} from '../shared/constants';
import * as IPC from '../shared/ipc';
import type { AppSettings, HotkeyKind, LauncherSize } from '../shared/types';
import { InsertEngine } from './insertion';
import { SelectionCapture } from './selectionCapture';
import { registerGlobalShortcuts, unregisterAllShortcuts } from './shortcuts';
import { TargetWindowTracker } from './targetWindowTracker';
import {
  createLauncherWindow,
  createTooltipWindow,
  nativeWindowHandleToNumber,
  setLauncherSize,
} from './window';

let mainWindow: BrowserWindow | null = null;
let tooltipWindow: BrowserWindow | null = null;
let database: CapsuleDatabase | null = null;
let isQuitting = false;

const insertEngine = new InsertEngine();
const selectionCapture = new SelectionCapture();
const targetWindowTracker = new TargetWindowTracker();

// 当前生效的快捷键处理器，便于自定义时更新。
let currentSettings: AppSettings | null = null;

// 追加命令行开关，双保险禁用 GPU（某些环境下仅调用 API 仍会初始化 GPU）。
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-software-rasterizer');
// 强制使用 SwiftShader 纯软件渲染：这是无显卡 / 远程桌面 / 虚拟机 /
// 驱动异常环境下唯一稳定可用的渲染路径，能彻底规避
// 「Failed to create GLES context → Renderer process crashed」的整进程崩溃。
app.commandLine.appendSwitch('use-gl', 'swiftshader');
app.commandLine.appendSwitch('in-process-gpu');

if (process.env.CHAT_CAPSULE_USER_DATA) {
  app.setPath('userData', process.env.CHAT_CAPSULE_USER_DATA);
}

app.on('before-quit', () => {
  isQuitting = true;
  targetWindowTracker.stop();
  tooltipWindow?.destroy();
  tooltipWindow = null;
});

app.on('window-all-closed', () => {
  // 保持后台运行，由右键菜单「退出」结束进程。
});

app.on('activate', () => {
  mainWindow?.setFocusable(true);
  mainWindow?.show();
});

/** 打开并聚焦主界面（唤起）。 */
function openMainUi(): void {
  mainWindow?.setFocusable(true);
  mainWindow?.show();
  mainWindow?.focus();
  mainWindow?.webContents.send(IPC.IPC_CAPSULE_GLOBAL_OPEN);
}

/** 向渲染进程发送轻量提示。 */
function notify(message: string): void {
  mainWindow?.webContents.send(IPC.IPC_CAPSULE_NOTICE, message);
}

/**
 * 全局快捷键「新增」：抓取选中文本保存为新胶囊。
 *
 * 无论面板当前处于收起（compact）还是展开态，都先展开面板，
 * 再执行新增，让用户能即时看到结果（否则收起态下静默新增无感知）。
 */
async function handleAddHotkey(): Promise<void> {
  const text = await selectionCapture.captureSelection();
  if (!text) {
    notify('未选中文本');
    return;
  }
  if (!database) {
    return;
  }
  // 先打开面板，再新增。
  openMainUi();
  try {
    createCapsule(database, text);
    notify('已加入聊天胶囊');
    // 通知渲染进程刷新列表（主进程侧新增，渲染进程无感知）。
    mainWindow?.webContents.send(IPC.IPC_CAPSULE_DATA_CHANGED);
  } catch {
    notify('保存失败');
  }
}

/**
 * 全局快捷键「替换」：抓取选中文本，通知渲染进程进入替换模式。
 *
 * 同样先展开面板，再进入替换模式，保证收起态下也能正常交互。
 */
async function handleReplaceHotkey(): Promise<void> {
  const text = await selectionCapture.captureSelection();
  if (!text) {
    notify('未选中文本');
    return;
  }
  // 先打开面板，再进入替换模式。
  openMainUi();
  mainWindow?.webContents.send(IPC.IPC_CAPSULE_REPLACE_MODE, text);
}

/** 注册（或重注册）全部全局快捷键。 */
function applyShortcuts(): void {
  if (!mainWindow || !currentSettings) {
    return;
  }
  unregisterAllShortcuts();
  const results = registerGlobalShortcuts(
    mainWindow,
    currentSettings,
    {
      add: () => void handleAddHotkey(),
      replace: () => void handleReplaceHotkey(),
    },
    () => {
      mainWindow?.setFocusable(true);
      mainWindow?.show();
      mainWindow?.focus();
    },
  );
  for (const result of results) {
    if (!result.registered) {
      console.warn(
        `[shortcut] ${result.name} (${result.accelerator}) 注册失败，可能与其他程序冲突`,
      );
    }
  }
}

async function start(): Promise<void> {
  database = openCapsuleDatabase(
    path.join(app.getPath('userData'), 'chat-capsule.sqlite'),
  );
  initializeSettings(database);
  currentSettings = getAppSettings(database);

  mainWindow = createLauncherWindow({
    preloadPath: path.join(__dirname, '../preload/preload.js'),
    rendererPath: path.join(__dirname, '../renderer/index.html'),
  });
  tooltipWindow = createTooltipWindow(path.join(__dirname, '../renderer/index.html'));

  targetWindowTracker.setSelfWindowHwnd(
    nativeWindowHandleToNumber(mainWindow.getNativeWindowHandle()),
  );
  targetWindowTracker.addSelfWindowHwnd(
    nativeWindowHandleToNumber(tooltipWindow.getNativeWindowHandle()),
  );
  targetWindowTracker.start();

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  applyShortcuts();

  registerDataIpc();
  registerWindowIpc();

  app.on('will-quit', () => {
    targetWindowTracker.stop();
    unregisterAllShortcuts();
    database?.close();
    database = null;
  });
}

/** 注册数据类 IPC（invoke）。 */
function registerDataIpc(): void {
  ipcMain.handle(IPC.IPC_CAPSULES_SEARCH, (_event, query: unknown, limit: unknown) => {
    if (typeof query !== 'string') {
      throw new Error('Invalid search query');
    }
    if (
      limit !== undefined &&
      (typeof limit !== 'number' ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 200)
    ) {
      throw new Error('Invalid search limit');
    }
    return searchCapsules(database!, query, limit as number | undefined);
  });

  ipcMain.handle(IPC.IPC_CAPSULES_ADD, (_event, content: unknown) => {
    if (typeof content !== 'string') {
      throw new Error('Invalid capsule content');
    }
    return createCapsule(database!, content);
  });

  ipcMain.handle(IPC.IPC_CAPSULES_UPDATE, (_event, id: unknown, content: unknown) => {
    if (typeof id !== 'number' || !Number.isInteger(id) || typeof content !== 'string') {
      throw new Error('Invalid capsule update');
    }
    return updateCapsuleContent(database!, id, content);
  });

  ipcMain.handle(IPC.IPC_CAPSULES_REPLACE, (_event, id: unknown, content: unknown) => {
    if (typeof id !== 'number' || !Number.isInteger(id) || typeof content !== 'string') {
      throw new Error('Invalid capsule replace');
    }
    return replaceCapsuleContent(database!, id, content);
  });

  ipcMain.handle(IPC.IPC_CAPSULES_REMOVE, (_event, id: unknown) => {
    if (typeof id !== 'number' || !Number.isInteger(id)) {
      throw new Error('Invalid capsule id');
    }
    deleteCapsule(database!, id);
  });

  ipcMain.handle(IPC.IPC_CAPSULES_REORDER, (_event, ids: unknown) => {
    if (
      !Array.isArray(ids) ||
      !ids.every((id) => typeof id === 'number' && Number.isInteger(id))
    ) {
      throw new Error('Invalid capsule order');
    }
    reorderCapsules(database!, ids);
  });

  // 导出：弹保存对话框，写入 JSON（字符串数组）。
  ipcMain.handle(IPC.IPC_CAPSULES_EXPORT, async () => {
    const contents = exportCapsuleContents(database!);
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow!, {
      title: '导出行话术',
      defaultPath: '聊天胶囊话术.json',
      filters: [{ name: 'JSON 文件', extensions: ['json'] }],
    });
    if (canceled || !filePath) {
      return { success: false, count: 0, filePath: null };
    }
    fs.writeFileSync(filePath, JSON.stringify(contents, null, 2), 'utf-8');
    return { success: true, count: contents.length, filePath };
  });

  // 导入：弹打开对话框，读取 JSON（字符串数组），仅新增不覆盖。
  ipcMain.handle(IPC.IPC_CAPSULES_IMPORT, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow!, {
      title: '导入话术',
      properties: ['openFile'],
      filters: [{ name: 'JSON 文件', extensions: ['json'] }],
    });
    if (canceled || filePaths.length === 0) {
      return { added: 0, skipped: 0, failed: 0 };
    }
    const raw = fs.readFileSync(filePaths[0], 'utf-8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('文件不是有效的 JSON');
    }
    if (!Array.isArray(parsed)) {
      throw new Error('文件格式不正确：应为话术文本数组');
    }
    const contents = parsed.filter(
      (item): item is string => typeof item === 'string',
    );
    const result = importCapsules(database!, contents);
    // 通知渲染进程刷新列表。
    mainWindow?.webContents.send(IPC.IPC_CAPSULE_DATA_CHANGED);
    return result;
  });

  ipcMain.handle(IPC.IPC_SETTINGS_GET, () => {
    return getAppSettings(database!);
  });

  ipcMain.handle(
    IPC.IPC_SETTINGS_SET_HOTKEY,
    (_event, key: unknown, accelerator: unknown) => {
      if (
        typeof key !== 'string' ||
        !HOTKEY_KINDS.includes(key as HotkeyKind) ||
        typeof accelerator !== 'string' ||
        !accelerator.trim()
      ) {
        throw new Error('Invalid hotkey setting');
      }
      const kind = key as HotkeyKind;
      const normalized = accelerator.trim();
      const field = hotkeyField(kind);

      // 检测应用内快捷键互相冲突：新 accelerator 不得与本应用另外两个
      // 快捷键相同。否则系统级注册看似成功，但 applyShortcuts 重注册时
      // 后注册者会静默失败，导致用户误以为设置成功。
      const otherFields = HOTKEY_KINDS.filter((k) => k !== kind).map(hotkeyField);
      const appConflict = otherFields.some(
        (f) => getSetting(database!, f) === normalized,
      );
      if (appConflict) {
        return { registered: false, conflict: true };
      }

      // 先尝试注册，检测系统级冲突。
      const registered = globalShortcut.register(normalized, () => undefined);

      if (registered) {
        // 注册成功后写库并重载快捷键。
        setSetting(database!, field, normalized);
        currentSettings = getAppSettings(database!);
        applyShortcuts();
      }

      return { registered, conflict: !registered };
    },
  );
}

/** 快捷键功能键 → settings 表字段名（snake_case）映射。 */
function hotkeyField(
  kind: HotkeyKind,
): 'global_hotkey_open' | 'global_hotkey_add' | 'global_hotkey_replace' {
  if (kind === 'open') {
    return 'global_hotkey_open';
  }
  if (kind === 'add') {
    return 'global_hotkey_add';
  }
  return 'global_hotkey_replace';
}

/** 注册窗口/交互类 IPC（send）。 */
function registerWindowIpc(): void {
  ipcMain.on(
    IPC.IPC_CAPSULE_SET_SIZE,
    (_event, size: unknown, height: unknown, width: unknown) => {
      if (mainWindow && (size === 'compact' || size === 'expanded')) {
        if (size === 'expanded') {
          tooltipWindow?.hide();
        }
        const safeHeight =
          typeof height === 'number' && Number.isFinite(height) ? height : undefined;
        const safeWidth =
          typeof width === 'number' && Number.isFinite(width) ? width : undefined;
        setLauncherSize(mainWindow, size as LauncherSize, safeHeight, safeWidth);
      }
    },
  );

  ipcMain.on(IPC.IPC_CAPSULE_MOVE, (_event, x: unknown, y: unknown) => {
    if (
      mainWindow &&
      typeof x === 'number' &&
      Number.isFinite(x) &&
      typeof y === 'number' &&
      Number.isFinite(y)
    ) {
      const bounds = mainWindow.getBounds();
      const display = screen.getDisplayMatching({
        x: Math.round(x),
        y: Math.round(y),
        width: bounds.width,
        height: bounds.height,
      });
      const area = display.workArea;
      const clampedX = Math.min(
        Math.max(Math.round(x), area.x),
        area.x + area.width - bounds.width,
      );
      const clampedY = Math.min(
        Math.max(Math.round(y), area.y),
        area.y + area.height - bounds.height,
      );
      mainWindow.setPosition(clampedX, clampedY);
    }
  });

  ipcMain.on(
    IPC.IPC_CAPSULE_RESIZE,
    (_event, corner: unknown, width: unknown, height: unknown) => {
      if (
        mainWindow &&
        (corner === 'top-left' ||
          corner === 'top-right' ||
          corner === 'bottom-left' ||
          corner === 'bottom-right') &&
        typeof width === 'number' &&
        Number.isFinite(width) &&
        typeof height === 'number' &&
        Number.isFinite(height)
      ) {
        const bounds = mainWindow.getBounds();
        const display = screen.getDisplayMatching(bounds);
        const area = display.workArea;

        // renderer 传的是 CSS 像素（与 window.innerWidth 同单位），
        // setBounds 需要物理像素，这里乘以设备缩放比统一。
        const ratio = display.scaleFactor || 1;
        const left = corner.endsWith('left');
        const top = corner.startsWith('top');

        // 绝对尺寸（物理像素），带最小/最大 clamp。
        // 注意：PANEL_MIN_* 与 PANEL_MAX 比例基准均为 CSS 像素，
        // 与 renderer 传入的单位一致，因此先统一到 CSS 域做 clamp，
        // 最后再乘以 ratio 转物理像素，避免单位混淆。
        let cssWidth = Math.max(PANEL_MIN_WIDTH, width);
        let cssHeight = Math.max(PANEL_MIN_HEIGHT, height);
        cssWidth = Math.min(
          Math.round((area.width * PANEL_MAX_WORKAREA_RATIO) / ratio),
          cssWidth,
        );
        cssHeight = Math.min(
          Math.round((area.height * PANEL_MAX_WORKAREA_RATIO) / ratio),
          cssHeight,
        );

        const targetWidth = Math.round(cssWidth * ratio);
        const targetHeight = Math.round(cssHeight * ratio);

        // 依据「固定对角」计算新坐标：拖动右下角 → 左上角固定。
        // 这里用「起始 bounds」做锚点，绝不复用上一次 setBounds 后的值，
        // 从根本上避免累积漂移。
        const newX = left ? bounds.x + bounds.width - targetWidth : bounds.x;
        const newY = top ? bounds.y + bounds.height - targetHeight : bounds.y;

        // 屏幕工作区边界 clamp。
        const clampedX = Math.min(
          Math.max(newX, area.x),
          area.x + area.width - targetWidth,
        );
        const clampedY = Math.min(
          Math.max(newY, area.y),
          area.y + area.height - targetHeight,
        );

        mainWindow.setBounds({
          x: clampedX,
          y: clampedY,
          width: targetWidth,
          height: targetHeight,
        });
      }
    },
  );

  ipcMain.on(IPC.IPC_CAPSULE_TOOLTIP_SHOW, () => {
    if (!mainWindow) {
      return;
    }
    if (!tooltipWindow || tooltipWindow.isDestroyed()) {
      tooltipWindow = createTooltipWindow(path.join(__dirname, '../renderer/index.html'));
      targetWindowTracker.addSelfWindowHwnd(
        nativeWindowHandleToNumber(tooltipWindow.getNativeWindowHandle()),
      );
    }
    const capsuleBounds = mainWindow.getBounds();
    const tooltipBounds = tooltipWindow.getBounds();
    tooltipWindow.setPosition(
      Math.round(capsuleBounds.x + (capsuleBounds.width - tooltipBounds.width) / 2),
      capsuleBounds.y + capsuleBounds.height + 8,
      false,
    );
    tooltipWindow.showInactive();
  });

  ipcMain.on(IPC.IPC_CAPSULE_TOOLTIP_HIDE, () => {
    tooltipWindow?.hide();
  });

  ipcMain.on(IPC.IPC_CAPSULE_CONTEXT_MENU, () => {
    if (!mainWindow) {
      return;
    }
    const isAlwaysOnTop = mainWindow.isAlwaysOnTop();
    const menu = Menu.buildFromTemplate([
      { label: '打开聊天胶囊', click: () => openMainUi() },
      {
        label: isAlwaysOnTop ? '取消置顶' : '置顶',
        click: () => {
          mainWindow?.setAlwaysOnTop(!isAlwaysOnTop, 'floating');
        },
      },
      { label: '设置', click: () => openMainUi() },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() },
    ]);
    menu.popup({ window: mainWindow });
  });

  ipcMain.on(IPC.IPC_CAPSULE_ACTIVATE, () => {
    mainWindow?.setFocusable(true);
    mainWindow?.show();
    mainWindow?.focus();
  });

  ipcMain.on(IPC.IPC_CAPSULE_DEACTIVATE, () => {
    mainWindow?.blur();
    mainWindow?.setFocusable(false);
    mainWindow?.showInactive();
  });

  ipcMain.on(IPC.IPC_CAPSULE_INSERT, (_event, payload: unknown) => {
    const candidate = payload as { text?: unknown; mode?: unknown } | null;
    if (
      !candidate ||
      typeof candidate.text !== 'string' ||
      (candidate.mode !== 'drag' && candidate.mode !== 'click')
    ) {
      return;
    }
    const window = mainWindow;
    if (!window) {
      return;
    }
    const targetHwnd =
      candidate.mode === 'click'
        ? (targetWindowTracker.getTargetWindow()?.hwnd ?? null)
        : null;
    window.hide();
    void insertEngine.insert(candidate.text, targetHwnd).then((success) => {
      if (isQuitting || window.isDestroyed()) {
        return;
      }
      window.setFocusable(false);
      window.showInactive();
      if (!success) {
        window.webContents.send(IPC.IPC_CAPSULE_NOTICE, '插入失败');
      }
    });
  });

  ipcMain.on(IPC.IPC_CAPSULE_HIDE, () => {
    mainWindow?.hide();
  });
}

app.whenReady().then(start).catch((error: unknown) => {
  console.error('聊天胶囊启动失败', error);
  app.quit();
});

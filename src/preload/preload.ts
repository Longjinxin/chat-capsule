import { contextBridge, ipcRenderer } from 'electron';
import * as IPC from '../shared/ipc';
import type {
  AppSettings,
  Capsule,
  CapsuleApi,
  ExportResult,
  HotkeyKind,
  ImportResult,
  LauncherSize,
  ResizeCorner,
  SetHotkeyResult,
} from '../shared/types';

/**
 * preload：通过 contextBridge 暴露白名单 API 给渲染进程。
 *
 * 渲染进程只能经 window.capsuleApi 与主进程通信，
 * 无法直接触碰 Node、数据库或任意 IPC channel。
 */
const api: CapsuleApi = {
  search: (query: string, limit?: number) =>
    ipcRenderer.invoke(IPC.IPC_CAPSULES_SEARCH, query, limit) as Promise<Capsule[]>,
  add: (content: string) =>
    ipcRenderer.invoke(IPC.IPC_CAPSULES_ADD, content) as Promise<Capsule>,
  update: (id: number, content: string) =>
    ipcRenderer.invoke(IPC.IPC_CAPSULES_UPDATE, id, content) as Promise<Capsule>,
  replace: (id: number, content: string) =>
    ipcRenderer.invoke(IPC.IPC_CAPSULES_REPLACE, id, content) as Promise<Capsule>,
  remove: (id: number) =>
    ipcRenderer.invoke(IPC.IPC_CAPSULES_REMOVE, id) as Promise<void>,
  reorder: (ids: number[]) =>
    ipcRenderer.invoke(IPC.IPC_CAPSULES_REORDER, ids) as Promise<void>,
  exportData: () =>
    ipcRenderer.invoke(IPC.IPC_CAPSULES_EXPORT) as Promise<ExportResult>,
  importData: () =>
    ipcRenderer.invoke(IPC.IPC_CAPSULES_IMPORT) as Promise<ImportResult>,
  getSettings: () =>
    ipcRenderer.invoke(IPC.IPC_SETTINGS_GET) as Promise<AppSettings>,
  setHotkey: (key: HotkeyKind, accelerator: string) =>
    ipcRenderer.invoke(IPC.IPC_SETTINGS_SET_HOTKEY, key, accelerator) as Promise<SetHotkeyResult>,

  setSize: (size: LauncherSize, height?: number, width?: number) =>
    ipcRenderer.send(IPC.IPC_CAPSULE_SET_SIZE, size, height, width),
  moveWindow: (x: number, y: number) =>
    ipcRenderer.send(IPC.IPC_CAPSULE_MOVE, x, y),
  resizeWindow: (corner: ResizeCorner, width: number, height: number) =>
    ipcRenderer.send(IPC.IPC_CAPSULE_RESIZE, corner, width, height),
  insertText: (text: string, mode: 'drag' | 'click') =>
    ipcRenderer.send(IPC.IPC_CAPSULE_INSERT, { text, mode }),
  activate: () => ipcRenderer.send(IPC.IPC_CAPSULE_ACTIVATE),
  deactivate: () => ipcRenderer.send(IPC.IPC_CAPSULE_DEACTIVATE),
  showTooltip: () => ipcRenderer.send(IPC.IPC_CAPSULE_TOOLTIP_SHOW),
  hideTooltip: () => ipcRenderer.send(IPC.IPC_CAPSULE_TOOLTIP_HIDE),
  showContextMenu: () => ipcRenderer.send(IPC.IPC_CAPSULE_CONTEXT_MENU),
  hide: () => ipcRenderer.send(IPC.IPC_CAPSULE_HIDE),

  onGlobalOpen: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on(IPC.IPC_CAPSULE_GLOBAL_OPEN, listener);
    return () => {
      ipcRenderer.removeListener(IPC.IPC_CAPSULE_GLOBAL_OPEN, listener);
    };
  },
  onNotice: (callback: (message: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: unknown) => {
      if (typeof message === 'string') {
        callback(message);
      }
    };
    ipcRenderer.on(IPC.IPC_CAPSULE_NOTICE, listener);
    return () => {
      ipcRenderer.removeListener(IPC.IPC_CAPSULE_NOTICE, listener);
    };
  },
  onReplaceMode: (callback: (newContent: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, newContent: unknown) => {
      if (typeof newContent === 'string') {
        callback(newContent);
      }
    };
    ipcRenderer.on(IPC.IPC_CAPSULE_REPLACE_MODE, listener);
    return () => {
      ipcRenderer.removeListener(IPC.IPC_CAPSULE_REPLACE_MODE, listener);
    };
  },
  onDataChanged: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on(IPC.IPC_CAPSULE_DATA_CHANGED, listener);
    return () => {
      ipcRenderer.removeListener(IPC.IPC_CAPSULE_DATA_CHANGED, listener);
    };
  },
};

contextBridge.exposeInMainWorld('capsuleApi', api);

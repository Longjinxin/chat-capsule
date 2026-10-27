/**
 * 跨进程共享的核心类型定义。
 *
 * 注意：本文件是纯类型定义，不得包含任何运行时副作用，
 * 由 main / preload / renderer 三端共同引用，保证接口契约一致。
 */

/** 胶囊（话术）实体，字段与数据库 snake_case 对齐。 */
export interface Capsule {
  id: number;
  content: string;
  color: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

/** 启动器窗口形态：compact 为收起态胶囊，expanded 为展开面板。 */
export type LauncherSize = 'compact' | 'expanded';

/** 应用设置（由 settings 表聚合而来，字段为驼峰命名）。 */
export interface AppSettings {
  globalHotkeyOpen: string;
  globalHotkeyAdd: string;
  globalHotkeyReplace: string;
  alwaysOnTop: boolean;
  launchOnStartup: boolean;
  windowPosition: { x: number; y: number } | null;
}

/** 前台目标窗口快照（用于插入目标跟踪）。 */
export interface TargetWindow {
  hwnd: number;
  processId: number;
  processName: string;
  title: string;
  timestamp: number;
}

/** 插入载荷。mode 区分单击可靠路径与拖拽兜底路径。 */
export interface InsertPayload {
  text: string;
  mode: 'drag' | 'click';
}

/** 替换载荷。保留胶囊颜色，仅更新正文。 */
export interface ReplacePayload {
  capsuleId: number;
  newContent: string;
}

/** 面板尺寸记忆（localStorage 存储）。 */
export interface PanelSize {
  width: number;
  height: number;
}

/** 缩放把手所在角（决定锚点：哪个角固定、哪个角跟随鼠标）。 */
export type ResizeCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** 话术导入结果统计。 */
export interface ImportResult {
  added: number;
  skipped: number;
  failed: number;
}

/** 话术导出结果。 */
export interface ExportResult {
  /** 是否成功（用户取消保存则 false）。 */
  success: boolean;
  /** 导出的条数。 */
  count: number;
  /** 保存的文件路径（取消时为 null）。 */
  filePath: string | null;
}

/** 全局快捷键的三个功能键标识。 */
export type HotkeyKind = 'open' | 'add' | 'replace';

/** 设置快捷键的返回结果。 */
export interface SetHotkeyResult {
  registered: boolean;
  conflict: boolean;
}

/**
 * preload 通过 contextBridge 暴露给渲染进程的白名单 API。
 * 渲染进程只能通过该接口与主进程通信，无法直接触碰 Node / 数据库。
 */
export interface CapsuleApi {
  search(query: string, limit?: number): Promise<Capsule[]>;
  add(content: string): Promise<Capsule>;
  update(id: number, content: string): Promise<Capsule>;
  replace(id: number, content: string): Promise<Capsule>;
  remove(id: number): Promise<void>;
  reorder(ids: number[]): Promise<void>;
  exportData(): Promise<ExportResult>;
  importData(): Promise<ImportResult>;
  getSettings(): Promise<AppSettings>;
  setHotkey(key: HotkeyKind, accelerator: string): Promise<SetHotkeyResult>;
  setSize(size: LauncherSize, height?: number, width?: number): void;
  moveWindow(x: number, y: number): void;
  resizeWindow(corner: ResizeCorner, width: number, height: number): void;
  insertText(text: string, mode: 'drag' | 'click'): void;
  activate(): void;
  deactivate(): void;
  showTooltip(): void;
  hideTooltip(): void;
  showContextMenu(): void;
  hide(): void;
  onGlobalOpen(callback: () => void): () => void;
  onNotice(callback: (message: string) => void): () => void;
  onReplaceMode(callback: (newContent: string) => void): () => void;
  onDataChanged(callback: () => void): () => void;
}

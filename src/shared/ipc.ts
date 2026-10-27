/**
 * IPC channel 常量与请求/响应类型集中定义。
 *
 * 约定：
 * - 以 `capsules:` / `settings:` 开头、走 `invoke`（有返回值）的为数据通道；
 * - 以 `capsule:` 开头、走 `send`（单向）的为窗口/交互控制通道；
 * - 以 `capsule:` 开头、主进程 → 渲染进程（webContents.send）的为事件推送。
 *
 * main 与 preload 必须引用同一份常量，避免字符串散落导致前后端不一致。
 */

/** 数据查询类（invoke）。 */
export const IPC_CAPSULES_SEARCH = 'capsules:search';
export const IPC_CAPSULES_ADD = 'capsules:add';
export const IPC_CAPSULES_UPDATE = 'capsules:update';
export const IPC_CAPSULES_REPLACE = 'capsules:replace';
export const IPC_CAPSULES_REMOVE = 'capsules:remove';
export const IPC_CAPSULES_REORDER = 'capsules:reorder';
export const IPC_CAPSULES_EXPORT = 'capsules:export';
export const IPC_CAPSULES_IMPORT = 'capsules:import';

/** 设置类（invoke）。 */
export const IPC_SETTINGS_GET = 'settings:get';
export const IPC_SETTINGS_SET_HOTKEY = 'settings:setHotkey';

/** 窗口/交互控制类（send，渲染 → 主）。 */
export const IPC_CAPSULE_INSERT = 'capsule:insert';
export const IPC_CAPSULE_SET_SIZE = 'capsule:set-size';
export const IPC_CAPSULE_RESIZE = 'capsule:resize';
export const IPC_CAPSULE_MOVE = 'capsule:move';
export const IPC_CAPSULE_ACTIVATE = 'capsule:activate';
export const IPC_CAPSULE_DEACTIVATE = 'capsule:deactivate';
export const IPC_CAPSULE_TOOLTIP_SHOW = 'capsule:tooltip-show';
export const IPC_CAPSULE_TOOLTIP_HIDE = 'capsule:tooltip-hide';
export const IPC_CAPSULE_CONTEXT_MENU = 'capsule:context-menu';
export const IPC_CAPSULE_HIDE = 'capsule:hide';

/** 事件推送类（主 → 渲染）。 */
export const IPC_CAPSULE_REPLACE_MODE = 'capsule:replace-mode';
export const IPC_CAPSULE_GLOBAL_OPEN = 'capsule:global-open';
export const IPC_CAPSULE_NOTICE = 'capsule:notice';
/** 数据已变更（主进程侧新增/替换/删除后推送，通知渲染进程刷新列表）。 */
export const IPC_CAPSULE_DATA_CHANGED = 'capsule:data-changed';

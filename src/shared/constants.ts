/**
 * 全局常量集中定义。
 *
 * 所有魔法数字、文案、默认值统一收敛于此，避免散落各处造成不一致。
 * 本文件无运行时副作用，可被 main / preload / renderer 三端共享。
 */

/** 窗口尺寸（收起态胶囊 92×36，展开面板默认 420×470）。 */
export const WINDOW_SIZES = {
  compact: { width: 92, height: 36 },
  expanded: { width: 420, height: 470 },
} as const;

/** 窗口距屏幕右上角边距（像素）。 */
export const WINDOW_MARGIN = 20;

/** 面板最小尺寸：宽 320 × 高 240。
 *  320 = 12(pad) + 32(添加) + 8 + 32(设置) + 8 + 60(最小搜索框) + 12(pad)
 *  保证缩小面板时两侧按钮始终可见。 */
export const PANEL_MIN_WIDTH = 320;
export const PANEL_MIN_HEIGHT = 240;

/** 面板最大尺寸比例：不超过主屏工作区的 1/2（宽、高均按此比例封顶）。
 *  避免四角拖拽时窗口被无限拉大、超出可视范围。 */
export const PANEL_MAX_WORKAREA_RATIO = 0.5;

/** 搜索默认一次性加载上限（内部 limit 上限 200）。 */
export const DEFAULT_SEARCH_LIMIT = 200;

/** 话术正文最大长度。 */
export const MAX_CAPSULE_LENGTH = 20000;

/** 搜索关键词最大长度。 */
export const MAX_QUERY_LENGTH = 200;

/** 胶囊颜色轮换表（视觉识别用，非分类/标签）。 */
export const CAPSULE_COLORS = [
  '#DCEFFF',
  '#FFE5C4',
  '#DDF2DF',
  '#FFE0EA',
  '#E7E3FF',
  '#FFF0D9',
] as const;

/** 收起态 Tooltip 延迟（毫秒）。 */
export const TOOLTIP_DELAY_MS = 300;

/** 轻量成功/失败提示时长（毫秒）。 */
export const NOTICE_DURATION_MS = 1000;

/** settings 表默认值（key 为 snake_case，与数据库字段一致）。
 * 键位说明：Alt+Space 为 Windows 系统保留键（窗口菜单），Ctrl+Shift+R 常被浏览器/IDE 占用，
 * 故改用冲突概率更低的组合，降低首次使用时的快捷键冲突。
 */
export const DEFAULT_SETTINGS = {
  global_hotkey_open: 'Ctrl+Alt+Space',
  global_hotkey_add: 'Ctrl+Shift+C',
  global_hotkey_replace: 'Ctrl+Alt+R',
  always_on_top: 'true',
  launch_on_startup: 'false',
  window_position: '',
} as const;

/** settings 表的合法 key 集合（用于校验，避免任意 key 写入）。 */
export const SETTING_KEYS = [
  'global_hotkey_open',
  'global_hotkey_add',
  'global_hotkey_replace',
  'always_on_top',
  'launch_on_startup',
  'window_position',
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

/** 三个可自定义的全局快捷键功能键。 */
export const HOTKEY_KINDS = ['open', 'add', 'replace'] as const;

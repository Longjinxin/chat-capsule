import { Pill as CapsuleIcon, Plus, Settings, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import chatBubbleIcon from '../assets/icons/chat-bubble.svg';
import type { AppSettings, Capsule, HotkeyKind } from '../shared/types';
import AddInput from './components/AddInput';
import CapsuleList from './components/CapsuleList';
import ResizeHandle from './components/ResizeHandle';
import SearchBox from './components/SearchBox';
import SettingsPanel from './components/SettingsPanel';
import { useCapsules } from './hooks/useCapsules';

/** 读取本地存储的面板尺寸记忆。 */
function readPanelSize(): { width: number; height: number } | null {
  try {
    const raw = localStorage.getItem('capsule_panel_size');
    if (raw) {
      const size = JSON.parse(raw) as { width?: unknown; height?: unknown };
      if (typeof size.width === 'number' && typeof size.height === 'number') {
        return { width: size.width, height: size.height };
      }
    }
  } catch {
    // 忽略损坏的尺寸数据。
  }
  return null;
}

/** 保存面板尺寸记忆。 */
function savePanelSize(): void {
  localStorage.setItem(
    'capsule_panel_size',
    JSON.stringify({ width: window.innerWidth, height: window.innerHeight }),
  );
}

export default function App() {
  const [expanded, setExpanded] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // 替换模式状态（快捷键触发）。
  const [replaceMode, setReplaceMode] = useState(false);
  const [replaceContent, setReplaceContent] = useState('');

  const searchRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const noticeTimerRef = useRef<number | undefined>(undefined);
  const tooltipTimerRef = useRef<number | undefined>(undefined);
  const lastDragMovedRef = useRef(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);

  const {
    query,
    setQuery,
    capsules,
    add,
    update,
    replace,
    remove,
    moveLocalByIds,
    persistOrder,
    sortEnabled,
  } = useCapsules();

  const showNotice = useCallback((text: string, duration = 1000): void => {
    window.clearTimeout(noticeTimerRef.current);
    setNotice(text);
    noticeTimerRef.current = window.setTimeout(() => setNotice(''), duration);
  }, []);

  // 展开/收起窗口尺寸控制。
  useEffect(() => {
    if (!expanded) {
      window.capsuleApi.setSize('compact');
      return undefined;
    }
    const panelSize = readPanelSize();
    window.capsuleApi.setSize('expanded', panelSize?.height, panelSize?.width);
    const timer = window.setTimeout(() => searchRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [expanded]);

  // 全局唤起事件。
  useEffect(() => {
    return window.capsuleApi.onGlobalOpen(() => {
      setExpanded(true);
      setAddMode(false);
    });
  }, []);

  // 轻量提示事件。
  useEffect(() => {
    return window.capsuleApi.onNotice((message) => {
      showNotice(message, 1000);
    });
  }, [showNotice]);

  // 替换模式事件（快捷键触发）。
  useEffect(() => {
    return window.capsuleApi.onReplaceMode((newContent) => {
      setExpanded(true);
      setAddMode(false);
      setShowSettings(false);
      setReplaceContent(newContent);
      setReplaceMode(true);
      showNotice('选择要替换的话术', 1500);
    });
  }, [showNotice]);

  // 加载设置。
  useEffect(() => {
    void window.capsuleApi.getSettings().then(setSettings);
  }, []);

  // 新增输入态自动聚焦。
  useEffect(() => {
    if (addMode) {
      draftRef.current?.focus();
    }
  }, [addMode]);

  function showTooltipSoon(): void {
    window.clearTimeout(tooltipTimerRef.current);
    tooltipTimerRef.current = window.setTimeout(() => {
      window.capsuleApi.showTooltip();
    }, 300);
  }

  function hideTooltip(): void {
    window.clearTimeout(tooltipTimerRef.current);
    window.capsuleApi.hideTooltip();
  }

  function collapse(): void {
    hideTooltip();
    setAddMode(false);
    setReplaceMode(false);
    setShowSettings(false);
    setExpanded(false);
    window.capsuleApi.deactivate();
  }

  async function handleSave(): Promise<void> {
    if (!draft.trim()) {
      return;
    }
    try {
      await add(draft);
      setDraft('');
      setAddMode(false);
      showNotice('已加入聊天胶囊');
    } catch {
      showNotice('保存失败');
    }
  }

  async function handleUpdate(id: number, content: string): Promise<void> {
    try {
      await update(id, content);
      showNotice('已保存');
    } catch {
      showNotice('保存失败');
    }
  }

  async function handleDelete(id: number): Promise<void> {
    try {
      await remove(id);
      showNotice('已删除');
    } catch {
      showNotice('删除失败');
    }
  }

  /** 替换模式：点击胶囊用新文本替换其正文。 */
  async function handleReplace(capsule: Capsule): Promise<void> {
    try {
      await replace(capsule.id, replaceContent);
      setReplaceMode(false);
      setReplaceContent('');
      showNotice('已替换');
    } catch {
      showNotice('替换失败');
    }
  }

  function handleReorderStart(id: number): void {
    // 过滤态（搜索框有内容）下禁用拖拽排序：搜索是临时视图，
    // 子集排序会导致 sort_order 全局冲突（详见 useCapsules 注释）。
    if (!sortEnabled) {
      return;
    }
    setDraggingId(id);
  }

  function handleReorderEnd(): void {
    setDraggingId(null);
  }

  /** 拖拽排序结束：提交最终顺序并持久化。 */
  function handleReorderCommit(ids: number[]): void {
    moveLocalByIds(ids);
    void persistOrder(ids);
  }

  function handleInsert(content: string, mode: 'drag' | 'click'): void {
    if (replaceMode) {
      return;
    }
    showNotice('已插入', 1200);
    window.capsuleApi.insertText(content, mode);
  }

  async function handleHotkeyChange(
    key: HotkeyKind,
    accelerator: string,
  ): Promise<{ registered: boolean; conflict: boolean }> {
    const result = await window.capsuleApi.setHotkey(key, accelerator);
    if (!result.conflict) {
      setSettings(await window.capsuleApi.getSettings());
      showNotice('已更新快捷键');
    }
    return result;
  }

  function beginCompactDrag(event: React.MouseEvent<HTMLButtonElement>): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    lastDragMovedRef.current = false;
    const startX = event.screenX;
    const startY = event.screenY;
    const offsetX = event.screenX - window.screenX;
    const offsetY = event.screenY - window.screenY;
    let moved = false;

    const handleMove = (moveEvent: MouseEvent): void => {
      const distance =
        Math.abs(moveEvent.screenX - startX) + Math.abs(moveEvent.screenY - startY);
      if (!moved && distance > 3) {
        moved = true;
        lastDragMovedRef.current = true;
      }
      if (moved) {
        window.capsuleApi.moveWindow(
          moveEvent.screenX - offsetX,
          moveEvent.screenY - offsetY,
        );
      }
    };

    const handleUp = (): void => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      if (!moved) {
        setExpanded(true);
      }
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }

  const hasQuery = query.trim().length > 0;

  return (
    <div
      className={`launcher ${expanded ? 'expanded' : 'compact'}`}
      onMouseDownCapture={() => window.capsuleApi.activate()}
    >
      {expanded ? (
        <div className="panel">
          <header className="panel-header">
            <button
              className="icon-button capsule-logo"
              onClick={collapse}
              aria-label="收起聊天胶囊"
              title="收起"
            >
              <CapsuleIcon size={17} />
            </button>
            {!addMode && !showSettings && (
              <SearchBox
                ref={searchRef}
                value={query}
                onChange={setQuery}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    collapse();
                  }
                }}
              />
            )}
            {/* 右上角「新增」按钮已隐藏：快捷键新增（Ctrl+Shift+C）已稳定，为主入口。
                新增逻辑（addMode / AddInput / handleSave）全部保留，如需恢复，
                把下面条件改为 true 即可。 */}
            {false && !showSettings && (
              <button
                className="icon-button"
                onClick={() => setAddMode((value) => !value)}
                aria-label={addMode ? '取消新增' : '新增话术'}
                title={addMode ? '取消' : '新增'}
              >
                {addMode ? <X size={16} /> : <Plus size={17} />}
              </button>
            )}
            <button
              className="icon-button"
              onClick={() => setShowSettings((value) => !value)}
              aria-label="设置"
              title="设置"
            >
              <Settings size={17} />
            </button>
          </header>

          {showSettings && settings ? (
            <SettingsPanel
              settings={settings}
              onClose={() => setShowSettings(false)}
              onHotkeyChange={handleHotkeyChange}
            />
          ) : addMode ? (
            <AddInput
              ref={draftRef}
              value={draft}
              onChange={setDraft}
              onSave={() => void handleSave()}
              onCancel={() => {
                setDraft('');
                setAddMode(false);
              }}
            />
          ) : (
            <main className="results">
              {replaceMode && (
                <div className="replace-banner">点击一条话术，用选中文字替换它</div>
              )}
              {capsules.length === 0 && !hasQuery ? (
                <div className="empty-state">
                  <p className="empty-title">还没有聊天话术</p>
                  <p className="empty-subtitle">选中文字后按新增快捷键，即可保存。</p>
                  <button className="button primary" onClick={() => setAddMode(true)}>
                    + 新增
                  </button>
                </div>
              ) : capsules.length === 0 ? (
                <div className="empty-state">
                  <p className="empty-title">没有找到相关话术</p>
                  <button className="button primary" onClick={() => setAddMode(true)}>
                    + 新增一条
                  </button>
                </div>
              ) : (
                <CapsuleList
                  capsules={capsules}
                  query={query}
                  draggingId={draggingId}
                  replaceMode={replaceMode}
                  sortDisabled={!sortEnabled}
                  onSave={(id, content) => void handleUpdate(id, content)}
                  onInsert={handleInsert}
                  onReplace={(capsule) => void handleReplace(capsule)}
                  onDelete={(id) => void handleDelete(id)}
                  onReorderStart={handleReorderStart}
                  onReorderEnd={handleReorderEnd}
                  onReorderCommit={handleReorderCommit}
                />
              )}
            </main>
          )}

          {notice && <div className="notice">{notice}</div>}
          <ResizeHandle
            onResize={(corner, deltaX, deltaY) =>
              window.capsuleApi.resizeWindow(corner, deltaX, deltaY)
            }
            onResizeEnd={savePanelSize}
          />
        </div>
      ) : (
        <button
          className="capsule-collapsed"
          onMouseDown={beginCompactDrag}
          onMouseEnter={showTooltipSoon}
          onMouseLeave={hideTooltip}
          onContextMenu={(event) => {
            event.preventDefault();
            hideTooltip();
            window.capsuleApi.showContextMenu();
          }}
          onClick={() => {
            if (!lastDragMovedRef.current) {
              hideTooltip();
              setExpanded(true);
            }
          }}
          aria-label="打开聊天胶囊"
        >
          <span className="capsule-collapsed-icon">
            <img src={chatBubbleIcon} alt="" width={16} height={16} />
          </span>
          <span className="capsule-collapsed-divider" aria-hidden="true" />
          <span className="capsule-collapsed-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </button>
      )}
    </div>
  );
}

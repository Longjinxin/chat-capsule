import { Menu, Pencil, Trash2 } from 'lucide-react';
import { useRef, useState, type CSSProperties } from 'react';
import type { Capsule } from '../../shared/types';
import HighlightText from './HighlightText';

interface CapsuleCardProps {
  capsule: Capsule;
  query: string;
  dragging: boolean;
  replaceMode: boolean;
  sortDisabled: boolean;
  onSave: (id: number, content: string) => void;
  onInsert: (content: string, mode: 'drag' | 'click') => void;
  onReplace: (capsule: Capsule) => void;
  onDelete: (id: number) => void;
  /** 拖拽排序手柄按下（由 CapsuleList 统一处理实时让位动画）。 */
  onDragPointerDown: (event: React.PointerEvent<HTMLButtonElement>, id: number) => void;
}

/**
 * CapsuleCard：话术卡片。
 *
 * - 单击卡片 = 可靠插入路径（InsertEngine）；
 * - 拖拽为 UI 兜底（最终也走 InsertEngine）；
 * - hover 显示编辑/删除按钮，拖拽按钮始终显示；
 * - 编辑在卡片内完成，删除有确认；
 * - hover 显示完整内容浮层；
 * - sortDisabled 为 true 时（搜索过滤态）禁用拖拽排序，避免子集排序
 *   导致 sort_order 全局冲突。
 */
export default function CapsuleCard({
  capsule,
  query,
  dragging,
  replaceMode,
  sortDisabled,
  onSave,
  onInsert,
  onReplace,
  onDelete,
  onDragPointerDown,
}: CapsuleCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(capsule.content);
  const [previewStyle, setPreviewStyle] = useState<CSSProperties | null>(null);
  const previewTimerRef = useRef<number | undefined>(undefined);

  function startEdit(): void {
    setDraft(capsule.content);
    setEditing(true);
  }

  function save(): void {
    if (!draft.trim()) {
      return;
    }
    onSave(capsule.id, draft);
    setEditing(false);
  }

  function cancel(): void {
    setDraft(capsule.content);
    setEditing(false);
  }

  function handleDelete(): void {
    if (window.confirm('删除这条聊天话术？')) {
      onDelete(capsule.id);
    }
  }

  return (
    <article
      className={`capsule-card ${editing ? 'editing' : ''} ${dragging ? 'dragging' : ''}`}
      style={{ '--capsule-color': capsule.color } as CSSProperties}
      data-capsule-id={capsule.id}
      draggable={!editing}
      onMouseEnter={(event) => {
        if (editing) {
          return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        // 悬停 1 秒后再弹出完整内容提示框。
        window.clearTimeout(previewTimerRef.current);
        previewTimerRef.current = window.setTimeout(() => {
          setPreviewStyle({
            position: 'fixed',
            top: rect.bottom + 4,
            left: rect.left + 20,
            width: 320,
            maxHeight: 220,
            zIndex: 1000,
          });
        }, 1000);
      }}
      onMouseLeave={() => {
        window.clearTimeout(previewTimerRef.current);
        setPreviewStyle(null);
      }}
      onClick={() => {
        if (editing) {
          return;
        }
        if (replaceMode) {
          onReplace(capsule);
          return;
        }
        onInsert(capsule.content, 'click');
      }}
      onDragStart={(event) => {
        if (replaceMode) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.setData('text/plain', capsule.content);
        const htmlContent = `<meta charset="utf-8"><div>${capsule.content
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br>')}</div>`;
        event.dataTransfer.setData('text/html', htmlContent);
        event.dataTransfer.effectAllowed = 'copy';
      }}
      onDragEnd={(event) => {
        if (replaceMode) {
          return;
        }
        if (event.dataTransfer.dropEffect === 'none') {
          onInsert(capsule.content, 'drag');
        }
      }}
    >
      <span className="capsule-card-accent" aria-hidden="true" />
      {editing ? (
        <div className="capsule-edit">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                cancel();
              }
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                save();
              }
            }}
            autoFocus
            aria-label="编辑话术"
          />
          <div className="capsule-edit-actions">
            <button className="edit-action" onClick={cancel}>
              取消
            </button>
            <button className="edit-action primary" onClick={save} disabled={!draft.trim()}>
              保存
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="capsule-card-content">
            <HighlightText content={capsule.content} query={query} />
          </p>
          <div className="capsule-actions">
            <button
              className="capsule-action"
              onClick={(event) => {
                event.stopPropagation();
                startEdit();
              }}
              aria-label="编辑话术"
              title="编辑"
            >
              <Pencil size={14} />
            </button>
            <button
              className="capsule-action danger"
              onClick={(event) => {
                event.stopPropagation();
                handleDelete();
              }}
              aria-label="删除话术"
              title="删除"
            >
              <Trash2 size={14} />
            </button>
          </div>
          <button
            className={`capsule-drag-handle ${sortDisabled ? 'disabled' : ''}`}
            onPointerDown={(event) => onDragPointerDown(event, capsule.id)}
            onClick={(event) => event.stopPropagation()}
            aria-label="拖拽排序"
            title={sortDisabled ? '搜索状态下不可排序' : '拖拽排序'}
            disabled={sortDisabled}
          >
            <Menu size={15} />
          </button>
        </>
      )}
      {previewStyle && !editing && (
        <div className="capsule-preview" style={previewStyle}>
          {capsule.content}
        </div>
      )}
    </article>
  );
}

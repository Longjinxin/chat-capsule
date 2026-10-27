import { forwardRef } from 'react';

interface AddInputProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

/**
 * AddInput：界面 "+" 进入的新增输入态。
 *
 * 用户输入正文后保存为胶囊；空正文禁用保存按钮。
 */
const AddInput = forwardRef<HTMLTextAreaElement, AddInputProps>(function AddInput(
  { value, onChange, onSave, onCancel },
  ref,
) {
  const canSave = value.trim().length > 0;

  return (
    <div className="add-panel">
      <textarea
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onCancel();
          }
        }}
        placeholder="输入话术正文"
        aria-label="话术正文"
        autoFocus
      />
      <div className="add-actions">
        <button className="button ghost" onClick={onCancel}>
          取消
        </button>
        <button className="button primary" onClick={onSave} disabled={!canSave}>
          保存
        </button>
      </div>
    </div>
  );
});

export default AddInput;

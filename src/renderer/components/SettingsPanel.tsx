import { Download, Upload, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AppSettings, HotkeyKind } from '../../shared/types';

interface SettingsPanelProps {
  settings: AppSettings;
  onClose: () => void;
  onHotkeyChange: (key: HotkeyKind, accelerator: string) => Promise<{ registered: boolean; conflict: boolean }>;
}

const HOTKEY_META: Array<{ kind: HotkeyKind; label: string }> = [
  { kind: 'open', label: '唤起 / 聚焦' },
  { kind: 'add', label: '新增（抓取选中文本）' },
  { kind: 'replace', label: '替换' },
];

/**
 * SettingsPanel：快捷键自定义 + 话术导入导出。
 *
 * 修改快捷键即时生效；导入导出通过系统文件对话框操作。
 */
export default function SettingsPanel({
  settings,
  onClose,
  onHotkeyChange,
}: SettingsPanelProps) {
  const [drafts, setDrafts] = useState<Record<HotkeyKind, string>>({
    open: settings.globalHotkeyOpen,
    add: settings.globalHotkeyAdd,
    replace: settings.globalHotkeyReplace,
  });
  const [conflicts, setConflicts] = useState<Record<HotkeyKind, boolean>>({
    open: false,
    add: false,
    replace: false,
  });
  const [transferMessage, setTransferMessage] = useState('');
  const [transferError, setTransferError] = useState(false);

  useEffect(() => {
    setDrafts({
      open: settings.globalHotkeyOpen,
      add: settings.globalHotkeyAdd,
      replace: settings.globalHotkeyReplace,
    });
  }, [settings]);

  async function apply(key: HotkeyKind, accelerator: string): Promise<void> {
    const trimmed = accelerator.trim();
    if (!trimmed) {
      return;
    }
    try {
      const result = await onHotkeyChange(key, trimmed);
      if (result.conflict) {
        setConflicts((prev) => ({ ...prev, [key]: true }));
      } else {
        setConflicts((prev) => ({ ...prev, [key]: false }));
        setDrafts((prev) => ({ ...prev, [key]: trimmed }));
      }
    } catch {
      setConflicts((prev) => ({ ...prev, [key]: true }));
    }
  }

  async function handleExport(): Promise<void> {
    setTransferMessage('');
    setTransferError(false);
    try {
      const result = await window.capsuleApi.exportData();
      if (result.success) {
        setTransferMessage(`已导出 ${result.count} 条话术`);
      }
    } catch {
      setTransferError(true);
      setTransferMessage('导出失败');
    }
  }

  async function handleImport(): Promise<void> {
    setTransferMessage('');
    setTransferError(false);
    try {
      const result = await window.capsuleApi.importData();
      const parts: string[] = [];
      if (result.added > 0) {
        parts.push(`新增 ${result.added} 条`);
      }
      if (result.skipped > 0) {
        parts.push(`跳过重复 ${result.skipped} 条`);
      }
      if (result.failed > 0) {
        parts.push(`失败 ${result.failed} 条`);
      }
      setTransferMessage(parts.length > 0 ? `导入完成：${parts.join('，')}` : '未导入任何话术');
    } catch (error) {
      setTransferError(true);
      setTransferMessage(error instanceof Error ? error.message : '导入失败');
    }
  }

  return (
    <div className="settings-panel">
      <header className="settings-header">
        <span className="settings-title">设置</span>
        <button className="icon-button" onClick={onClose} aria-label="关闭设置" title="关闭">
          <X size={16} />
        </button>
      </header>
      <div className="settings-body">
        <p className="settings-hint">点击下方输入框后按下新的快捷键组合。</p>
        {HOTKEY_META.map(({ kind, label }) => (
          <div className="settings-row" key={kind}>
            <label className="settings-label" htmlFor={`hotkey-${kind}`}>
              {label}
            </label>
            <input
              id={`hotkey-${kind}`}
              className={`settings-input ${conflicts[kind] ? 'conflict' : ''}`}
              value={drafts[kind]}
              onChange={(event) => setDrafts((prev) => ({ ...prev, [kind]: event.target.value }))}
              onBlur={() => void apply(kind, drafts[kind])}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void apply(kind, drafts[kind]);
                }
              }}
              spellCheck={false}
            />
            {conflicts[kind] && (
              <span className="settings-conflict">快捷键冲突，请重新设置</span>
            )}
          </div>
        ))}
        <p className="settings-note">设置即时生效，无需重启。</p>

        <div className="settings-divider" />

        <div className="settings-row">
          <span className="settings-label">话术导入 / 导出</span>
          <div className="transfer-actions">
            <button className="transfer-button" onClick={() => void handleImport()}>
              <Upload size={14} />
              导入
            </button>
            <button className="transfer-button" onClick={() => void handleExport()}>
              <Download size={14} />
              导出
            </button>
          </div>
          {transferMessage && (
            <span className={transferError ? 'settings-conflict' : 'settings-note'}>
              {transferMessage}
            </span>
          )}
          <p className="settings-note">导入仅做新增，不会覆盖现有话术；内容相同的条目自动跳过。</p>
        </div>
      </div>
    </div>
  );
}

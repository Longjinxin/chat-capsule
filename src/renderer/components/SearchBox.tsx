import { Search, X } from 'lucide-react';
import { forwardRef } from 'react';

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
}

/**
 * SearchBox：搜索框，面板打开后自动聚焦。
 *
 * 有内容时显示一键清空按钮；Escape 等键盘事件交由调用方处理。
 */
const SearchBox = forwardRef<HTMLInputElement, SearchBoxProps>(
  function SearchBox({ value, onChange, onKeyDown, placeholder = '搜索话术' }, ref) {
    return (
      <div className="search-box">
        <Search size={15} aria-hidden="true" />
        <input
          ref={ref}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={placeholder}
        />
        {value.length > 0 && (
          <button
            className="clear-button"
            aria-label="清空搜索"
            title="清空"
            onClick={() => onChange('')}
          >
            <X size={14} />
          </button>
        )}
      </div>
    );
  },
);

export default SearchBox;

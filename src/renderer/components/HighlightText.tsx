import { Fragment, type ReactNode } from 'react';

interface HighlightTextProps {
  content: string;
  query: string;
}

/**
 * HighlightText：在正文中高亮命中关键词。
 *
 * 关键词为空时原样返回；命中部分用 <mark> 包裹。关键词视为普通文本
 * （正则转义），避免特殊字符干扰。
 */
export default function HighlightText({ content, query }: HighlightTextProps) {
  const term = query.trim();
  if (!term) {
    return <>{content}</>;
  }
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = content.split(new RegExp(`(${escaped})`, 'gi'));
  const nodes: ReactNode[] = parts.map((part, index) => {
    if (part.toLowerCase() === term.toLowerCase()) {
      return (
        <mark key={index} className="search-highlight">
          {part}
        </mark>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
  return <>{nodes}</>;
}

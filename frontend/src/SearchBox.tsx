import { useState, useRef, useCallback, useEffect } from 'react';
import { Input, Spin, Empty, Tag, Typography } from '@arco-design/web-react';
import { IconSearch, IconFile, IconBook } from '@arco-design/web-react/icon';
import { useTranslation } from 'react-i18next';
import { api, type SearchResult } from './api';
import { useShortcuts } from './hooks/useShortcuts';

interface SearchBoxProps {
  onResultClick?: (result: SearchResult) => void;
  onNavigateToNote?: (noteId: string) => void;
  onNavigateToCard?: () => void;
  onNavigateToFile?: (fileId: string) => void;
}

const { Text } = Typography;

const SearchBox = ({ onResultClick, onNavigateToNote, onNavigateToCard, onNavigateToFile }: SearchBoxProps) => {
  const { t } = useTranslation();
  const { getShortcutDisplay } = useShortcuts();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOpen = isFocused;

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.search(searchQuery.trim());
      if (response.success) {
        setResults(response.results);
      }
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const debouncedSearch = useCallback((searchQuery: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(searchQuery);
    }, 200);
  }, [performSearch]);

  const handleInputChange = (value: string) => {
    setQuery(value);
    setSelectedIndex(-1);
    if (value.trim()) {
      debouncedSearch(value);
    } else {
      setResults([]);
    }
  };

  const handleResultClick = (result: SearchResult) => {
    setIsFocused(false);
    setQuery('');
    setResults([]);

    if (onResultClick) {
      onResultClick(result);
    } else if (result.type === 'note' && onNavigateToNote) {
      onNavigateToNote(result.id);
    } else if (result.type === 'card' && onNavigateToCard) {
      onNavigateToCard();
    } else if (result.type === 'file' && onNavigateToFile) {
      onNavigateToFile(result.id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < results.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          handleResultClick(results[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsFocused(false);
        inputRef.current?.blur();
        break;
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);

  useEffect(() => {
    const handleAccessibilityChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ noAnimation?: boolean }>).detail;
      if (detail?.noAnimation) {
        setIsFocused(false);
        inputRef.current?.blur();
      }
    };

    window.addEventListener('papyrus_accessibility_changed', handleAccessibilityChanged);
    return () => {
      window.removeEventListener('papyrus_accessibility_changed', handleAccessibilityChanged);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const highlightMatch = (text: string, queryStr: string) => {
    if (!queryStr.trim()) return text;
    const regex = new RegExp(`(${queryStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <span key={i} className="tw-bg-primary-light tw-font-medium">
          {part}
        </span>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  };

  const getTypeIcon = (type: string) => {
    if (type === 'note') {
      return <IconFile className="tw-text-base tw-text-arco-text-2" />;
    }
    if (type === 'file') {
      return <IconFile className="tw-text-base tw-text-arco-text-2" />;
    }
    return <IconBook className="tw-text-base tw-text-arco-text-2" />;
  };

  const getMatchedFieldLabel = (field: string) => {
    const labels: Record<string, string> = {
      title: t('searchBox.fields.title'),
      content: t('searchBox.fields.content'),
      tags: t('searchBox.fields.tags'),
      question: t('searchBox.fields.question'),
      answer: t('searchBox.fields.answer'),
      name: t('searchBox.fields.name'),
      file_type: t('searchBox.fields.fileType'),
      mime_type: t('searchBox.fields.mimeType'),
    };
    return labels[field] || field;
  };

  return (
    <div ref={containerRef} className="tw-relative tw-w-full">
      <Input
        ref={inputRef}
        placeholder={t('searchBox.placeholder', { shortcut: getShortcutDisplay('search') })}
        prefix={<IconSearch aria-hidden="true" />}
        size="small"
        value={query}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setTimeout(() => {
            // 延时检查焦点是否仍在搜索框内；为不可聚焦的子元素添加 tabIndex 后 activeElement 不会跳到 body
            const el = document.activeElement;
            if (containerRef.current && el && !containerRef.current.contains(el)) {
              setIsFocused(false);
            }
          }, 200);
        }}

        className="titlebar-search-input"
        allowClear
        aria-label={t('searchBox.ariaLabel', { shortcut: getShortcutDisplay('search') })}
        aria-autocomplete="list"
        aria-controls={isOpen ? 'search-results-listbox' : undefined}
        aria-expanded={isOpen}
        aria-activedescendant={selectedIndex >= 0 ? `search-result-${selectedIndex}` : undefined}
      />

      {/* 搜索结果下拉菜单 */}
      {isOpen && (
        <div
          id="search-results-listbox"
          role="listbox"
          aria-label={t('searchBox.resultsAriaLabel')}
          className="tw-absolute tw-left-0 tw-right-0 tw-z-50 tw-overflow-hidden tw-bg-arco-bg-popup tw-rounded-card tw-border tw-border-arco-border-hairline tw-shadow-2 no-drag search-dropdown-enter"
          style={{
            top: 'calc(100% + 8px)',
            minWidth: '360px',
          }}
        >
          <div style={{ minHeight: '200px', maxHeight: '400px', overflow: 'auto' }}>
            {/* 加载状态 */}
            {isLoading && (
              <div className="tw-flex tw-items-center tw-justify-center" style={{ height: '180px' }}>
                <Spin size={32} />
              </div>
            )}

            {/* 空状态 */}
            {!isLoading && query.trim() && results.length === 0 && (
              <div className="tw-flex tw-items-center tw-justify-center" style={{ height: '180px' }}>
                <Empty description={t('searchBox.noResults')} />
              </div>
            )}

            {/* 初始状态 */}
            {!isLoading && !query.trim() && (
              <div className="tw-p-6">
                <Text type="secondary" className="tw-text-sm">
                  {t('searchBox.initialHint')}
                </Text>
                <div className="tw-mt-4 tw-flex tw-gap-2 tw-flex-wrap">
                  <Tag size="small" className="tw-text-xs">{t('searchBox.keyboardNavigate')}</Tag>
                  <Tag size="small" className="tw-text-xs">{t('searchBox.keyboardSelect')}</Tag>
                  <Tag size="small" className="tw-text-xs">{t('searchBox.keyboardClose')}</Tag>
                </div>
              </div>
            )}

            {/* 搜索结果列表 */}
            {!isLoading && results.length > 0 && (
              <div>
                {/* 统计信息 */}
                <div className="tw-px-4 tw-py-2.5 tw-border-b tw-border-arco-border-2 tw-flex tw-justify-between tw-items-center">
                  <Text type="secondary" className="tw-text-xs">
                    {t('searchBox.resultCount', { count: results.length })}
                  </Text>
                  <div className="tw-flex tw-gap-2">
                    {results.some(r => r.type === 'note') && (
                      <Tag size="small" color="arcoblue">
                        {t('searchBox.noteCount', { count: results.filter(r => r.type === 'note').length })}
                      </Tag>
                    )}
                    {results.some(r => r.type === 'card') && (
                      <Tag size="small" color="green">
                        {t('searchBox.cardCount', { count: results.filter(r => r.type === 'card').length })}
                      </Tag>
                    )}
                    {results.some(r => r.type === 'file') && (
                      <Tag size="small" color="orange">
                        {t('searchBox.fileCount', { count: results.filter(r => r.type === 'file').length })}
                      </Tag>
                    )}
                  </div>
                </div>

                {/* 结果项 */}
                {results.map((result, index) => (
                  <div
                    key={`${result.type}-${result.id}`}
                    id={`search-result-${index}`}
                    role="option"
                    aria-selected={selectedIndex === index}
                    onClick={() => handleResultClick(result)}
                    tabIndex={0}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`tw-px-4 tw-py-3 tw-cursor-pointer tw-transition-colors tw-duration-150 tw-flex tw-items-start tw-gap-3 ${
                      selectedIndex === index ? 'tw-bg-arco-fill-2' : 'tw-bg-transparent'
                    }`}
                    style={{
                      borderBottom: '1px solid var(--color-border-1)',
                    }}
                  >
                    {/* 图标 */}
                    <div className="tw-mt-1 tw-flex-shrink-0">
                      {getTypeIcon(result.type)}
                    </div>

                    {/* 内容 */}
                    <div className="tw-flex-1 tw-min-w-0">
                      {/* 标题行 */}
                      <div className="tw-flex tw-items-center tw-gap-2 tw-mb-2">
                        <Text className="tw-font-medium tw-text-sm tw-truncate">
                          {highlightMatch(result.title, query)}
                        </Text>
                        <Tag size="small" color="gray">
                          {getMatchedFieldLabel(result.matched_field)}
                        </Tag>
                      </div>

                      {/* 预览 */}
                      <Text
                        type="secondary"
                        className="tw-text-sm tw-truncate tw-block"
                      >
                        {highlightMatch(result.preview, query)}
                      </Text>

                      {/* 文件夹 */}
                      <div className="tw-flex tw-items-center tw-gap-2 tw-mt-2">
                        {result.folder && (
                          <Text type="secondary" className="tw-text-xs">
                            📁 {result.folder}
                          </Text>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchBox;

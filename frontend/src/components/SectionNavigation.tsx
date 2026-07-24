/**
 * 节标题导航组件
 * 
 * WCAG 2.4.10 Section Headings (AAA 级)
 * 帮助用户理解页面结构并快速导航
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Typography } from '@arco-design/web-react';
import { useA11ySettings } from '../contexts/AccessibilityContext';

const { Text } = Typography;

// ============================================
// 类型定义
// ============================================

interface HeadingInfo {
  id: string;
  text: string;
  level: number;
}

// ============================================
// 辅助函数
// ============================================

/** 生成安全的 ID */
const generateId = (text: string, index: number): string => {
  const sanitized = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
  return `heading-${sanitized || index}`;
};

/** 从 DOM 提取标题 */
const extractHeadings = (container: HTMLElement): HeadingInfo[] => {
  const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
  const result: HeadingInfo[] = [];
  
  headings.forEach((heading, index) => {
    // 跳过已隐藏的标题
    if (heading.closest('.sr-only, .visually-hidden, [aria-hidden="true"]')) {
      return;
    }
    
    const text = heading.textContent?.trim() || '';
    if (!text) return;
    
    // 确保标题有 ID
    let id = heading.id;
    if (!id) {
      id = generateId(text, index);
      heading.id = id;
    }
    
    result.push({
      id,
      text,
      level: parseInt(heading.tagName[1], 10),
    });
  });
  
  return result;
};

// ============================================
// 组件
// ============================================

interface SectionNavigationProps {
  /** 要监视的容器选择器 */
  containerSelector?: string;
  /** 最小标题层级 */
  minLevel?: number;
  /** 最大标题层级 */
  maxLevel?: number;
}

/**
 * 节标题导航组件
 * 自动扫描页面标题并生成导航
 */
export const SectionNavigation: React.FC<SectionNavigationProps> = ({
  containerSelector = 'main, [role="main"], #main-content',
  minLevel = 2,
  maxLevel = 3,
}) => {
  const [headings, setHeadings] = useState<HeadingInfo[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const settings = useA11ySettings();

  // 扫描标题
  useEffect(() => {
    const scanHeadings = () => {
      const container = document.querySelector(containerSelector);
      if (container) {
        const allHeadings = extractHeadings(container as HTMLElement);
        // 过滤层级
        const filtered = allHeadings.filter(
          h => h.level >= minLevel && h.level <= maxLevel
        );
        setHeadings(filtered);
      }
    };

    scanHeadings();

    // 监听 DOM 变化
    const observer = new MutationObserver(scanHeadings);
    const container = document.querySelector(containerSelector);
    if (container) {
      observer.observe(container, { childList: true, subtree: true });
    }

    return () => observer.disconnect();
  }, [containerSelector, minLevel, maxLevel]);

  // 监听滚动，更新当前活动标题
  useEffect(() => {
    const handleScroll = () => {
      if (headings.length === 0) return;

      // 找到当前可见的标题
      const scrollPos = window.scrollY + 100; // 偏移量

      for (let i = headings.length - 1; i >= 0; i--) {
        const heading = document.getElementById(headings[i].id);
        if (heading) {
          const offsetTop = heading.getBoundingClientRect().top + window.scrollY;
          if (offsetTop <= scrollPos) {
            setActiveId(headings[i].id);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // 初始调用

    return () => window.removeEventListener('scroll', handleScroll);
  }, [headings]);

  // 点击导航
  const handleClick = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: settings.noAnimation ? 'auto' : 'smooth' });
      element.focus({ preventScroll: true });
      setActiveId(id);
    }
  }, [settings.noAnimation]);

  // 如果没有标题或未启用，不渲染
  if (headings.length === 0 || !settings.sectionNavigation) {
    return null;
  }

  return (
    <nav 
      className="aaa-section-nav-panel"
      aria-label="页面内容"
    >
      <Text 
        bold 
        style={{ 
          fontSize: 13, 
          marginBottom: 12, 
          display: 'block',
          color: 'var(--color-text-1)',
        }}
      >
        页面内容
      </Text>
      <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {headings.map((heading) => (
          <li 
            key={heading.id}
            style={{ 
              marginLeft: (heading.level - minLevel) * 12,
              marginBottom: 4,
            }}
          >
            <a
              href={`#${heading.id}`}
              onClick={(e) => {
                e.preventDefault();
                handleClick(heading.id);
              }}
              style={{
                display: 'block',
                padding: '4px 8px',
                borderRadius: 4,
                fontSize: 12,
                color: activeId === heading.id 
                  ? 'var(--color-primary)' 
                  : 'var(--color-text-2)',
                backgroundColor: activeId === heading.id 
                  ? 'var(--color-primary-light)' 
                  : 'transparent',
                textDecoration: 'none',
                transition: 'all 0.2s',
                borderLeft: activeId === heading.id 
                  ? '2px solid var(--color-primary)' 
                  : '2px solid transparent',
              }}
              aria-current={activeId === heading.id ? 'true' : undefined}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
};

// ============================================
// 便捷 Hook：为标题自动添加 ID
// ============================================

/**
 * 自动为区域内的标题添加 ID
 * 用于配合 SectionNavigation
 */
export const useAutoHeadingIds = (containerRef: React.RefObject<HTMLElement>) => {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach((heading, index) => {
      if (!heading.id) {
        const text = heading.textContent?.trim() || '';
        if (text) {
          heading.id = generateId(text, index);
        }
      }
    });
  }, [containerRef]);
};

export default SectionNavigation;

import { useRef, useState, useEffect } from 'react';

interface NavItem {
  key: string;
}

interface UseScrollNavigationOptions {
  initialSection?: string;
  scrollOffset?: number;
  highlightOffset?: number;
}

interface UseScrollNavigationResult {
  contentRef: React.RefObject<HTMLDivElement | null>;
  activeSection: string;
  scrollToSection: (sectionId: string) => void;
}

export function useScrollNavigation<T extends NavItem>(
  navItems: T[],
  options: UseScrollNavigationOptions = {}
): UseScrollNavigationResult {
  const {
    initialSection = navItems[0]?.key || '',
    scrollOffset = 24,
    highlightOffset = 100,
  } = options;

  const contentRef = useRef<HTMLDivElement>(null);
  const isScrollingProgrammatically = useRef(false);
  const [activeSection, setActiveSection] = useState<string>(initialSection);

  const scrollToSection = (sectionId: string) => {
    if (contentRef.current) {
      const element = contentRef.current.querySelector(`#${sectionId}`);
      if (!element) {
        console.warn(`Section with id '${sectionId}' not found`);
        return;
      }
      isScrollingProgrammatically.current = true;
      setActiveSection(sectionId);
      contentRef.current.scrollTo({
        top: (element as HTMLElement).offsetTop - scrollOffset,
        behavior: 'smooth'
      });
      setTimeout(() => {
        isScrollingProgrammatically.current = false;
      }, 500);
    }
  };

  useEffect(() => {
    const contentElement = contentRef.current;
    if (!contentElement) return;

    const handleScroll = () => {
      if (isScrollingProgrammatically.current) return;

      const sections = navItems.map(item => ({
        key: item.key,
        element: contentElement.querySelector(`#${item.key}`) as HTMLElement,
      })).filter(s => s.element);

      const scrollTop = contentElement.scrollTop;

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i];
        if (section.element && section.element.offsetTop - highlightOffset <= scrollTop) {
          setActiveSection(section.key);
          break;
        }
      }
    };

    contentElement.addEventListener('scroll', handleScroll);
    return () => contentElement.removeEventListener('scroll', handleScroll);
  }, [navItems, highlightOffset]);

  return {
    contentRef,
    activeSection,
    scrollToSection,
  };
}

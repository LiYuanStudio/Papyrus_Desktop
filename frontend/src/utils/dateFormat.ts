/**
 * 全局日期格式工具
 * 原因：统一前端日期显示格式，使用户在设置中选择的日期格式真正生效。
 * 未使用 toLocaleDateString：需要精确控制四种固定格式（yyyy-MM-dd 等），
 * 而非依赖浏览器的 locale 实现，确保跨平台一致性。
 */

export type DateFormat = 'yyyy-MM-dd' | 'yyyy/MM/dd' | 'dd/MM/yyyy' | 'MM/dd/yyyy';

const DATE_FORMAT_KEY = 'papyrus_date_format';
const DEFAULT_FORMAT: DateFormat = 'yyyy-MM-dd';

/**
 * 获取用户设置的日期格式，未设置时返回默认值。
 */
export function getDateFormat(): DateFormat {
  const saved = localStorage.getItem(DATE_FORMAT_KEY);
  if (
    saved === 'yyyy-MM-dd' ||
    saved === 'yyyy/MM/dd' ||
    saved === 'dd/MM/yyyy' ||
    saved === 'MM/dd/yyyy'
  ) {
    return saved;
  }
  return DEFAULT_FORMAT;
}

/**
 * 保存用户选择的日期格式到 localStorage。
 */
export function setDateFormat(format: DateFormat): void {
  localStorage.setItem(DATE_FORMAT_KEY, format);
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * 根据用户设置格式化日期。
 * 支持 Date 对象、秒级时间戳、ISO 日期字符串。
 */
export function formatDateBySetting(date: Date | number | string | null): string {
  if (date === null || date === undefined || date === '') {
    return '';
  }

  let d: Date;
  if (date instanceof Date) {
    d = date;
  } else if (typeof date === 'number') {
    d = new Date(date * 1000);
  } else {
    d = new Date(date);
  }

  if (Number.isNaN(d.getTime())) {
    return '';
  }

  const year = d.getFullYear().toString();
  const month = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());

  const format = getDateFormat();
  switch (format) {
    case 'yyyy-MM-dd':
      return `${year}-${month}-${day}`;
    case 'yyyy/MM/dd':
      return `${year}/${month}/${day}`;
    case 'dd/MM/yyyy':
      return `${day}/${month}/${year}`;
    case 'MM/dd/yyyy':
      return `${month}/${day}/${year}`;
    default:
      return `${year}-${month}-${day}`;
  }
}

export type RelativeTimeNamespace = 'notesPage' | 'startPage';

/**
 * 将秒级 Unix 时间戳格式化为相对时间文案（今天 / 昨天 / N 天前 / N 周前 / N 个月前 / N 年前）。
 * 输入为与后端 updated_at 一致的秒级时间戳，输出为经 t 翻译后的字符串。
 *
 * 原因：NoteCard、NoteDetailView、RecentNotes 三处原先各持有一份逐字相同的实现，
 * 调整时间档位必须同步改三处，已存在不同步风险，因此抽为共享工具。
 *
 * 未使用 Intl.RelativeTimeFormat：相对时间的措辞由 locales 语言包统一维护，
 * Intl 的输出无法与现有四个语言的文案保持一致，且脱离 i18n 的翻译与回退机制。
 *
 * namespace 由调用方传入而非写死：startPage 与 notesPage 各自维护时间文案
 * 且空格风格不同（startPage 无空格、notesPage 有空格），合并成一套 key
 * 会连带改动既有语言包文案。档位边界沿用原有实现（30 天进位月、365 天进位年）。
 */
export function formatRelativeTime(
  timestamp: number,
  t: (key: string, options?: Record<string, unknown>) => string,
  namespace: RelativeTimeNamespace
): string {
  const diffDays = Math.floor((Date.now() - timestamp * 1000) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return t(`${namespace}.today`);
  if (diffDays === 1) return t(`${namespace}.yesterday`);
  if (diffDays < 7) return t(`${namespace}.daysAgo`, { count: diffDays });
  if (diffDays < 30) return t(`${namespace}.weeksAgo`, { count: Math.floor(diffDays / 7) });
  if (diffDays < 365) return t(`${namespace}.monthsAgo`, { count: Math.floor(diffDays / 30) });
  return t(`${namespace}.yearsAgo`, { count: Math.floor(diffDays / 365) });
}

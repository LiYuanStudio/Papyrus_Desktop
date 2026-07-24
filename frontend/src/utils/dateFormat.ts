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

// 节气计算，基于寿星万年历算法简化版
// 每个节气的近似儒略日偏移，精度到天
const TERMS = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分',
  '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
  '小暑', '大暑', '立秋', '处暑', '白露', '秋分',
  '寒露', '霜降', '立冬', '小雪', '大雪', '冬至',
];

// 各节气在对应月份中的近似日期（基于 2000 年前后）
const TERM_DATES: Record<number, [number, number][]> = {
  1:  [[6, 0], [20, 1]],
  2:  [[4, 2], [19, 3]],
  3:  [[6, 4], [21, 5]],
  4:  [[5, 6], [20, 7]],
  5:  [[6, 8], [21, 9]],
  6:  [[6, 10], [21, 11]],
  7:  [[7, 12], [23, 13]],
  8:  [[7, 14], [23, 15]],
  9:  [[8, 16], [23, 17]],
  10: [[8, 18], [23, 19]],
  11: [[7, 20], [22, 21]],
  12: [[7, 22], [22, 23]],
};

/**
 * 节气 API 接口预留。
 * 如需接入在线节气服务，请在应用设置中配置 API URL 和 Key，
 * 并将其存入 localStorage（key: 'papyrus_solar_term_api_url', 'papyrus_solar_term_api_key'）。
 * 未配置时自动降级到本地查表。
 *
 * 预期接口格式：GET {url}?date=YYYY-MM-DD
 * 预期响应格式：{ solarTerm: string | null }
 */
export async function fetchSolarTerm(date: Date): Promise<string | null> {
  // 向后兼容：迁移旧 key
  const oldUrl = localStorage.getItem('solarTermApiUrl');
  const oldKey = localStorage.getItem('solarTermApiKey');
  if (oldUrl) {
    localStorage.setItem('papyrus_solar_term_api_url', oldUrl);
    localStorage.removeItem('solarTermApiUrl');
  }
  if (oldKey) {
    localStorage.setItem('papyrus_solar_term_api_key', oldKey);
    localStorage.removeItem('solarTermApiKey');
  }

  const apiUrl = localStorage.getItem('papyrus_solar_term_api_url');
  const apiKey = localStorage.getItem('papyrus_solar_term_api_key');
  if (!apiUrl) return null;

  // Validate URL: must be http/https and not a private address
  let validatedUrl: URL;
  try {
    validatedUrl = new URL(apiUrl);
  } catch {
    return null;
  }
  if (validatedUrl.protocol !== 'http:' && validatedUrl.protocol !== 'https:') {
    return null;
  }
  const hostname = validatedUrl.hostname.toLowerCase();
  if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(hostname) || hostname.startsWith('10.') || hostname.startsWith('192.168.')) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 1500);
  try {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const res = await fetch(`${apiUrl}?date=${dateStr}`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.solarTerm ?? null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function getSolarTerm(date: Date): string | null {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const entries = TERM_DATES[month] ?? [];
  for (const [termDay, termIndex] of entries) {
    if (day === termDay) return TERMS[termIndex];
  }
  return null;
}

export interface RecentItem {
  id: string;
  type: 'note' | 'card' | 'file';
  title: string;
  timestamp: number;
}

const STORAGE_KEY = 'papyrus_recent_files';
const MAX_ITEMS = 15;

function loadItems(): RecentItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item: unknown) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as RecentItem).id === 'string' &&
        typeof (item as RecentItem).type === 'string' &&
        typeof (item as RecentItem).title === 'string' &&
        typeof (item as RecentItem).timestamp === 'number'
    );
  } catch {
    return [];
  }
}

function saveItems(items: RecentItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function getRecentItems(): RecentItem[] {
  return loadItems().sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_ITEMS);
}

export function addRecentItem(item: Omit<RecentItem, 'timestamp'>): void {
  const items = loadItems().filter(i => !(i.id === item.id && i.type === item.type));
  items.push({ ...item, timestamp: Date.now() });
  const sorted = items.sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_ITEMS);
  saveItems(sorted);
  window.dispatchEvent(new CustomEvent('papyrus_recent_files_changed'));
}

export function clearRecentItems(): void {
  saveItems([]);
  window.dispatchEvent(new CustomEvent('papyrus_recent_files_changed'));
}

export function removeRecentItem(id: string, type: string): void {
  const items = loadItems().filter(i => !(i.id === id && i.type === type));
  saveItems(items);
  window.dispatchEvent(new CustomEvent('papyrus_recent_files_changed'));
}

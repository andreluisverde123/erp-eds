import { useLocalStorage } from './use-local-storage';
import type { SearchResultItem } from '@/features/search/types';

const MAX_RECENT_ITEMS = 8;

export function useRecentItems() {
  const [recentItems, setRecentItems] = useLocalStorage<SearchResultItem[]>('eds:recent-items', []);

  function addRecent(item: SearchResultItem) {
    setRecentItems((prev) => {
      const withoutItem = prev.filter((existing) => existing.id !== item.id);
      return [item, ...withoutItem].slice(0, MAX_RECENT_ITEMS);
    });
  }

  return { recentItems, addRecent };
}

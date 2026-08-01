import { useLocalStorage } from './use-local-storage';

export interface FavoriteRecord {
  type: string;
  id: string;
  label: string;
  subtitle?: string;
  path: string;
}

function favoriteKey(type: string, id: string) {
  return `${type}:${id}`;
}

export function useFavorites() {
  const [favorites, setFavorites] = useLocalStorage<FavoriteRecord[]>('eds:favorite-records', []);

  function isFavorite(type: string, id: string) {
    return favorites.some(
      (favorite) => favoriteKey(favorite.type, favorite.id) === favoriteKey(type, id),
    );
  }

  function toggleFavorite(record: FavoriteRecord) {
    setFavorites((prev) => {
      const exists = prev.some(
        (favorite) =>
          favoriteKey(favorite.type, favorite.id) === favoriteKey(record.type, record.id),
      );
      return exists
        ? prev.filter(
            (favorite) =>
              favoriteKey(favorite.type, favorite.id) !== favoriteKey(record.type, record.id),
          )
        : [record, ...prev];
    });
  }

  return { favorites, isFavorite, toggleFavorite };
}

import { useLocalStorage } from './use-local-storage';

export interface SavedFilterPreset<TFilters> {
  name: string;
  filters: TFilters;
}

export function useSavedFilters<TFilters>(storageKey: string) {
  const [presets, setPresets] = useLocalStorage<SavedFilterPreset<TFilters>[]>(storageKey, []);

  function savePreset(name: string, filters: TFilters) {
    setPresets((prev) => [...prev.filter((preset) => preset.name !== name), { name, filters }]);
  }

  function applyPreset(name: string): TFilters | undefined {
    return presets.find((preset) => preset.name === name)?.filters;
  }

  function deletePreset(name: string) {
    setPresets((prev) => prev.filter((preset) => preset.name !== name));
  }

  return { presets, savePreset, applyPreset, deletePreset };
}

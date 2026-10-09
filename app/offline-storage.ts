export type PersistentStorageManager = {
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
};

export const OFFLINE_SELECTION_STORAGE_KEY = "thuthayatethar:offline-selection";

type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

export async function requestPersistentStorage(storage?: PersistentStorageManager | null): Promise<boolean> {
  if (!storage) return false;
  try {
    if (storage.persisted && await storage.persisted()) return true;
    return storage.persist ? await storage.persist() : false;
  } catch {
    return false;
  }
}

export function readOfflineSelection(storage: KeyValueStorage): string[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(OFFLINE_SELECTION_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return Array.from(new Set(parsed.filter((item): item is string => typeof item === "string" && item.length > 0)));
  } catch {
    return [];
  }
}

export function writeOfflineSelection(storage: KeyValueStorage, selection: string[]): void {
  try {
    storage.setItem(OFFLINE_SELECTION_STORAGE_KEY, JSON.stringify(Array.from(new Set(selection.filter(Boolean)))));
  } catch {
    // Downloads remain usable even when local storage is unavailable.
  }
}

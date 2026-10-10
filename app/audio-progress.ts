export type AudioProgressBook = {
  id: string | number;
  slug?: string;
  audio_url?: string;
  soundcloud_url?: string;
  youtube_url?: string;
};

export type AudioProgress = {
  positionMs: number;
  durationMs: number;
  updatedAt: number;
};

export type RecentListening<T extends AudioProgressBook> = AudioProgress & { book: T };

type ProgressStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function audioProgressStorageKey(book: AudioProgressBook): string {
  return `thuthayatethar:audio-progress:${book.slug ?? book.id}`;
}

function readNumber(storage: ProgressStorage, key: string): number | null {
  const value = storage.getItem(key);
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function readAudioProgress(book: AudioProgressBook, storage: ProgressStorage): AudioProgress | null {
  try {
    const key = audioProgressStorageKey(book);
    const position = readNumber(storage, key);
    const duration = readNumber(storage, `${key}:duration`) ?? 0;
    const updatedAt = readNumber(storage, `${key}:updatedAt`);
    // Older versions saved only the playback position, so continue offering those resumes.
    if (updatedAt === null && (position === null || position <= 0)) return null;
    const positionMs = position ?? 0;
    return {
      positionMs: duration > 0 ? Math.min(positionMs, duration) : positionMs,
      durationMs: duration,
      updatedAt: updatedAt ?? 0,
    };
  } catch {
    return null;
  }
}

export function saveAudioDuration(book: AudioProgressBook, storage: ProgressStorage, durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return;
  try { storage.setItem(`${audioProgressStorageKey(book)}:duration`, String(Math.floor(durationMs))); }
  catch { /* Playback remains available when storage is disabled. */ }
}

export function saveAudioProgress(
  book: AudioProgressBook,
  storage: ProgressStorage,
  positionMs: number,
  durationMs: number,
  updatedAt = Date.now(),
): void {
  if (!Number.isFinite(positionMs) || positionMs < 0) return;
  const position = durationMs > 0 ? Math.min(positionMs, durationMs) : positionMs;
  try {
    const key = audioProgressStorageKey(book);
    storage.setItem(key, String(Math.floor(position)));
    if (Number.isFinite(durationMs) && durationMs > 0) storage.setItem(`${key}:duration`, String(Math.floor(durationMs)));
    storage.setItem(`${key}:updatedAt`, String(Math.max(0, Math.floor(updatedAt))));
  } catch { /* Playback remains available when storage is disabled. */ }
}

export function clearAudioProgress(book: AudioProgressBook, storage: ProgressStorage): void {
  try {
    const key = audioProgressStorageKey(book);
    storage.setItem(key, "0");
    storage.removeItem(`${key}:updatedAt`);
  } catch { /* Ignore unavailable storage. */ }
}

export function mostRecentListening<T extends AudioProgressBook>(
  books: T[],
  storage: ProgressStorage,
): RecentListening<T> | null {
  const recent = books
    .filter((book) => Boolean(book.audio_url || book.soundcloud_url || book.youtube_url))
    .flatMap((book) => {
      const progress = readAudioProgress(book, storage);
      return progress ? [{ book, ...progress }] : [];
    })
    .sort((left, right) => right.updatedAt - left.updatedAt);
  return recent[0] ?? null;
}

export function formatAudioTime(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "0:00";
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

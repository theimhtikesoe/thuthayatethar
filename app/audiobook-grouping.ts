export type AudiobookShelfBook = {
  id: string | number;
  slug?: string;
  title: string;
  author?: string;
  category?: string;
  coverImage?: string;
  soundcloud_url?: string;
};

export type AudiobookCoverGroup<T extends AudiobookShelfBook> = {
  key: string;
  title: string;
  coverImage?: string;
  books: T[];
};

function recordKey(book: AudiobookShelfBook): string {
  return String(book.slug ?? book.id);
}

function normalizeTitleDigits(value: string): string {
  return value.normalize("NFKC").replace(/[၀-၉]/g, (digit) => String(digit.charCodeAt(0) - 0x1040));
}

function chapterNumberFromTitle(title: string): number | null {
  const normalized = normalizeTitleDigits(title).toLowerCase();
  const match = normalized.match(/\b(?:chapter|episode|part)\s*[-_:]?\s*(\d+)/i)
    ?? normalized.match(/(?:အခန်း|အပိုင်း)\s*[-_:]?\s*(\d+)/)
    ?? normalized.match(/(?:^|[\s._-])(\d+)(?:\s*[-–—]\s*\d+)?\s*$/);
  if (!match) return null;
  const chapter = Number(match[1]);
  return Number.isSafeInteger(chapter) ? chapter : null;
}

function chapterSeriesTitle(title: string): string {
  return normalizeTitleDigits(title)
    .replace(/\b(?:chapter|episode|part)\s*[-_:]?\s*\d+(?:\s*[-–—]\s*\d+)?\b/gi, " ")
    .replace(/(?:အခန်း|အပိုင်း)\s*[-_:]?\s*\d+(?:\s*[-–—]\s*\d+)?/g, " ")
    .replace(/[\s._-]*\d+(?:\s*[-–—]\s*\d+)?\s*$/, "")
    .replace(/[\s._-]+/g, " ")
    .trim() || title;
}

function normalizedImageKey(value: string): string {
  try {
    const url = new URL(value, "https://thuthayatethar.invalid");
    url.hash = "";
    url.search = "";
    if (/(^|\.)sndcdn\.com$/i.test(url.hostname)) {
      return `soundcloud-artwork:${url.pathname.replace(/-(?:large|t\d+x\d+|crop|badge|tiny|original)(?=\.[^.]+$)/i, "").toLowerCase()}`;
    }
    return url.href.toLowerCase();
  } catch {
    return value.trim().split(/[?#]/, 1)[0].toLowerCase();
  }
}

function isSoundCloudCoverProxy(value?: string): boolean {
  if (!value) return false;
  try { return new URL(value, "https://thuthayatethar.invalid").pathname === "/api/soundcloud/cover"; }
  catch { return false; }
}

export function groupAudiobooks<T extends AudiobookShelfBook>(
  books: T[],
  resolvedCoverKeys: Record<string, string> = {},
): AudiobookCoverGroup<T>[] {
  type IndexedGroup = { firstIndex: number; books: T[]; image?: string };
  const groups = new Map<string, IndexedGroup>();

  books.forEach((book, index) => {
    const explicitImage = book.coverImage?.trim();
    const resolvedCoverKey = resolvedCoverKeys[recordKey(book)];
    const imageKey = resolvedCoverKey
      ? `soundcloud:${normalizedImageKey(resolvedCoverKey)}`
      : explicitImage && !isSoundCloudCoverProxy(explicitImage)
        ? `image:${normalizedImageKey(explicitImage)}`
        : `track:${recordKey(book)}`;
    const group = groups.get(imageKey);
    if (group) group.books.push(book);
    else groups.set(imageKey, { firstIndex: index, books: [book], image: explicitImage || undefined });
  });

  return Array.from(groups.entries())
    .sort((left, right) => left[1].firstIndex - right[1].firstIndex)
    .map(([key, group]) => {
      const entries = group.books.map((book, index) => ({ book, index, chapter: chapterNumberFromTitle(book.title) }));
      if (entries.length > 1 && entries.every((entry) => entry.chapter !== null)) {
        entries.sort((left, right) => left.chapter! - right.chapter! || left.index - right.index);
      }
      const sortedBooks = entries.map((entry) => entry.book);
      const baseTitle = chapterSeriesTitle(sortedBooks[0].title);
      const title = sortedBooks.every((book) => chapterSeriesTitle(book.title).normalize("NFKC").toLowerCase() === baseTitle.normalize("NFKC").toLowerCase())
        ? baseTitle
        : sortedBooks[0].title;
      return { key, title, coverImage: group.image, books: sortedBooks };
    });
}

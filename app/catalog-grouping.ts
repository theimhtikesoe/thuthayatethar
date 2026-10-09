export type ChapterBook = {
  id: string | number;
  title: string;
  author?: string;
};

export type ChapterGroup<T extends ChapterBook> = {
  book: T;
  chapters: T[];
};

function normalizeDigits(value: string): string {
  return value.replace(/[၀-၉]/g, (digit) => String(digit.charCodeAt(0) - 0x1040));
}

function normalizedTitle(title: string): string {
  return normalizeDigits(title.normalize("NFKC")).toLowerCase().trim();
}

function chapterRangeFromTitle(title: string): { start: number; end: number } | null {
  const normalized = normalizedTitle(title);
  const match = normalized.match(/\b(?:chapter|episode|part)\s*[-_:]?\s*(\d+)(?:\s*[-–—]\s*(\d+))?/i)
    ?? normalized.match(/(?:အခန်း|အပိုင်း)\s*[-_:]?\s*(\d+)(?:\s*[-–—]\s*(\d+))?/)
    ?? normalized.match(/(?:^|[\s._-])(\d+)(?:\s*[-–—]\s*(\d+))?\s*$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) ? { start, end } : null;
}

export function chapterNumberFromTitle(title: string): number | null {
  return chapterRangeFromTitle(title)?.start ?? null;
}
function stripChapterNumber(title: string): string {
  return normalizeDigits(title.normalize("NFKC"))
    .replace(/\b(?:chapter|episode|part)\s*[-_:]?\s*\d+(?:\s*[-–—]\s*\d+)?\b/gi, " ")
    .replace(/(?:အခန်း|အပိုင်း)\s*[-_:]?\s*\d+(?:\s*[-–—]\s*\d+)?/g, " ")
    .replace(/[\s._-]*\d+(?:\s*[-–—]\s*\d+)?\s*$/, "")
    .replace(/[\s._-]+/g, " ")
    .trim();
}
export function chapterSeriesTitle(title: string): string {
  return stripChapterNumber(title) || title;
}

function chapterGroupKey(title: string): string {
  return stripChapterNumber(title).toLowerCase();
}

function isKnownSeriesWithoutChapterNumber(title: string): boolean {
  return ["tian guan ci fu", "heaven official's blessing", "heaven officials blessing"].includes(normalizedTitle(title).replace(/[’]/g, "'"));
}

export function chapterLabel(book: ChapterBook, fallbackNumber?: number): string {
  const range = chapterRangeFromTitle(book.title);
  if (!range) return fallbackNumber ? `အခန်း ${fallbackNumber}` : book.title;
  return range.start === range.end ? `အခန်း ${range.start}` : `အခန်း ${range.start}–${range.end}`;
}
export function groupTitle<T extends ChapterBook>(group: ChapterGroup<T>): string {
  if (group.chapters.length < 2) return group.book.title;
  return chapterSeriesTitle(group.book.title);
}

export function groupBooks<T extends ChapterBook>(books: T[]): ChapterGroup<T>[] {
  const candidates = new Map<string, Array<{ book: T; index: number; chapter: number | null }>>();
  const result: Array<{ index: number; group: ChapterGroup<T> }> = [];

  books.forEach((book, index) => {
    const chapter = chapterNumberFromTitle(book.title);
    if (chapter === null) {
      if (isKnownSeriesWithoutChapterNumber(book.title)) {
        const key = `known-series:${chapterGroupKey(book.title)}`;
        const items = candidates.get(key);
        if (items) items.push({ book, index, chapter: null });
        else candidates.set(key, [{ book, index, chapter: null }]);
        return;
      }
      // Identical titles can refer to separate works; never merge them by title alone.
      result.push({ index, group: { book, chapters: [book] } });
      return;
    }
    const author = book.author?.normalize("NFKC").toLowerCase().trim() ?? "";
    const key = `${chapterGroupKey(book.title)}\u0000${author}`;
    const items = candidates.get(key);
    if (items) items.push({ book, index, chapter });
    else candidates.set(key, [{ book, index, chapter }]);
  });

  candidates.forEach((items) => {
    const chapterNumbers = new Set(items.map((item) => item.chapter));
    const isKnownUntitledSeries = items.length > 1 && items.every((item) => item.chapter === null);
    if (isKnownUntitledSeries || (items.length > 1 && chapterNumbers.size === items.length)) {
      const chapters = [...items]
        .sort((left, right) => left.chapter === null || right.chapter === null ? left.index - right.index : left.chapter - right.chapter)
        .map((item) => item.book);
      result.push({ index: items[0].index, group: { book: chapters[0], chapters } });
    } else {
      // Duplicate records for the same chapter remain separately manageable cards.
      for (const item of items) result.push({ index: item.index, group: { book: item.book, chapters: [item.book] } });
    }
  });

  return result.sort((left, right) => left.index - right.index).map((item) => item.group);
}

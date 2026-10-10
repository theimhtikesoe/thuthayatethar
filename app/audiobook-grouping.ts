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

type NumberedChapter = { baseTitle: string; number: number };

function numberedChapter(title: string): NumberedChapter | null {
  const normalized = normalizeTitleDigits(title).trim();
  const spokenNovel = normalized.match(/^0*(\d+)\s*[-.)]\s*အသံထွက်ဝတ္ထု(?:\s|$)/i);
  if (spokenNovel) return { baseTitle: "အသံထွက်ဝတ္ထု", number: Number(spokenNovel[1]) };
  const boAungDin = normalized.match(/^bo\s+aung\s+din(?:\s+ဗိုလ်အောင်ဒင်)?\s*(\d+)/i);
  if (boAungDin) return { baseTitle: "Bo Aung Din / ဗိုလ်အောင်ဒင်", number: Number(boAungDin[1]) };
  const marked = normalized.match(/\b(?:chapter|part|episode)\s*[-_:()]?\s*(\d+)\b/i)
    ?? normalized.match(/(?:အခန်း|အပိုင်း)\s*[-_:()]?\s*(\d+)/);
  if (marked) {
    const number = Number(marked[1]);
    const baseTitle = normalized
      .replace(/\b(?:chapter|part|episode)\s*[-_:()]?\s*\d+(?:\s*[-–—]\s*\d+)?\b/gi, " ")
      .replace(/(?:အခန်း|အပိုင်း)\s*[-_:()]?\s*\d+(?:\s*[-–—]\s*\d+)?/g, " ")
      .replace(/[\s._-]+/g, " ")
      .trim();
    return Number.isSafeInteger(number) && baseTitle ? { baseTitle, number } : null;
  }

  // Some audiobook series carry only a trailing number (for example
  // "မင်းလူ ... ၅", "... ၆"). Treat the shared title before that number as
  // the book identity so these parts can be selected from one card.
  const trailing = normalized.match(/(?:^|[\s._-])(\d+)\s*$/);
  if (!trailing) return null;
  const number = Number(trailing[1]);
  const baseTitle = normalized.slice(0, trailing.index).replace(/[\s._-]+$/g, "").replace(/[\s._-]+/g, " ").trim();
  return Number.isSafeInteger(number) && baseTitle ? { baseTitle, number } : null;
}

function normalizedIdentity(value: string): string {
  return normalizeTitleDigits(value).normalize("NFKC").replace(/[’]/g, "'").toLowerCase().replace(/\s+/g, " ").trim();
}

function seriesIdentity(baseTitle: string): string {
  const identity = normalizedIdentity(baseTitle);
  // These uploads use two title spellings for the same numbered audiobook.
  if (/^ရွှေဥ(?:ဒေါင်း|ဒါင်း)(?:\s|$)/.test(identity) && /(?:ရတနာသိုက်|သိုက်အရ)/.test(identity)) {
    return "ရွှေဥဒေါင်း ရတနာသိုက်";
  }
  // Keep future numbered uploads of this known ဖေမြင့် title together even
  // when the uploader appends the part number after the author name.
  if (/make it come true/.test(identity) && /ဖေမြင့်|ဖေမြင့်/.test(identity)) return "make it come true ဖေမြင့်";
  return identity;
}

export function groupAudiobooks<T extends AudiobookShelfBook>(books: T[]): AudiobookCoverGroup<T>[] {
  type ChapterEntry = { book: T; index: number; number: number };
  const chapterGroups = new Map<string, ChapterEntry[]>();
  const grouped: Array<{ firstIndex: number; group: AudiobookCoverGroup<T> }> = [];

  books.forEach((book, index) => {
    const chapter = numberedChapter(book.title);
    if (!chapter) {
      // Shared artwork is not enough to identify one audiobook: compilations
      // often reuse a cover while each numbered track must remain playable.
      grouped.push({
        firstIndex: index,
        group: { key: `track:${recordKey(book)}`, title: book.title, coverImage: book.coverImage, books: [book] },
      });
      return;
    }
    const author = normalizedIdentity(book.author ?? "");
    const baseTitle = seriesIdentity(chapter.baseTitle);
    const isTianGuanCiFu = /^tian\s+guan\s+ci\s+fu(?:\s|$)/i.test(baseTitle);
    const isCuratedSeries = isTianGuanCiFu || baseTitle === "အသံထွက်ဝတ္ထု" || baseTitle === "bo aung din / ဗိုလ်အောင်ဒင်";
    // Metadata authors are inconsistent across uploads of the same Tian Guan
    // Ci Fu series, so title identity must win for this known series.
    const key = isCuratedSeries ? baseTitle : `${baseTitle}\u0000${author}`;
    const entries = chapterGroups.get(key);
    const entry = { book, index, number: chapter.number };
    if (entries) entries.push(entry);
    else chapterGroups.set(key, [entry]);
  });

  chapterGroups.forEach((entries) => {
    const uniqueNumbers = new Set(entries.map((entry) => entry.number));
    if (entries.length < 2 || uniqueNumbers.size !== entries.length) {
      // Duplicate records for one chapter remain separately manageable cards.
      entries.forEach((entry) => {
        grouped.push({
          firstIndex: entry.index,
          group: { key: `track:${recordKey(entry.book)}`, title: entry.book.title, coverImage: entry.book.coverImage, books: [entry.book] },
        });
      });
      return;
    }
    const ordered = entries.slice().sort((left, right) => left.number - right.number || left.index - right.index);
    const first = ordered[0].book;
    const chapter = numberedChapter(first.title)!;
    grouped.push({
      firstIndex: Math.min(...entries.map((entry) => entry.index)),
      group: {
        key: `chapters:${normalizedIdentity(chapter.baseTitle)}:${normalizedIdentity(first.author ?? "")}`,
        title: chapter.baseTitle,
        coverImage: first.coverImage,
        books: ordered.map((entry) => entry.book),
      },
    });
  });

  return grouped.sort((left, right) => left.firstIndex - right.firstIndex).map(({ group }) => group);
}

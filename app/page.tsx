"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import dynamic from "next/dynamic";
import AudiobookPlayer, { AudiobookShelf } from "./components/AudiobookPlayer";
import { chapterLabel, groupBooks, groupTitle, isBedAungThaik, type ChapterGroup } from "./catalog-grouping";
import { formatAudioTime, mostRecentListening } from "./audio-progress";
import { correctedCatalogTitle } from "./burmese-text";
import { readOfflineSelection, writeOfflineSelection } from "./offline-storage";
import { pdfCoverCacheKey, readPdfCover, writePdfCover } from "./pdf-cover-cache";

const FlipBook = dynamic(() => import("./FlipBook"), { ssr: false });

type Rights = "full" | "summary";
type Theme = "paper" | "sepia" | "night";

type Book = {
  id: number;
  title: string;
  author: string;
  category: string;
  year: string;
  readingTime: number;
  pages: string[];
  summary: string;
  color: string;
  accent: string;
  mark: string;
  rights: Rights;
  tag: string;
  pdfUrl?: string;
  coverImage?: string;
  externalUrl?: string;
  soundcloud_url?: string;
  youtube_url?: string;
  youtubeAudioStatus?: string;
  audio_url?: string;
  sourceType?: string;
  submissionSource?: string;
  publicationStatus?: string;
  slug?: string;
};

type BookGroup = ChapterGroup<Book>;

type RecentReading = {
  group: BookGroup;
  book: Book;
  page: number;
  totalPages: number;
  updatedAt: number;
};

type RecentListening = {
  book: Book;
  positionMs: number;
  durationMs: number;
  updatedAt: number;
};

const books: Book[] = [
  {
    id: 1,
    title: "မိုးရေထဲက လမ်းလျှောက်သူ",
    author: "မေမြို့မင်း",
    category: "ဝတ္ထု",
    year: "၂၀၂၄",
    readingTime: 18,
    color: "#cad7d3",
    accent: "#264e4b",
    mark: "MM",
    tag: "အယ်ဒီတာရွေးချယ်မှု",
    rights: "full",
    summary: "မိုးရာသီတစ်ခုအတွင်း မြို့ဟောင်းလေးတစ်မြို့၏ လမ်းသွယ်များ၊ လူငယ်တစ်ယောက်၏ အိပ်မက်နှင့် မိသားစုအမှတ်တရများကို နူးညံ့စွာ ချိတ်ဆက်ထားသည့် ခေတ်ပြိုင်ဝတ္ထုတို။",
    pages: [
      "မိုးစက်တွေဟာ တစ်မြို့လုံးရဲ့ အသံတွေကို ဖုံးအုပ်ထားတယ်။ လမ်းမကြီးက ကားသံတွေ၊ ဆိုင်ရှေ့က ရယ်သံတွေ၊ အိမ်တံခါးပိတ်သံတွေက မိုးရဲ့ တိတ်ဆိတ်မှုထဲမှာ ပျော်ဝင်သွားကြတယ်။",
      "သူက ထီးမဆောင်းဘဲ လမ်းလျှောက်လာတယ်။ လက်ထဲမှာတော့ မဖွင့်ရသေးတဲ့ စာအုပ်တစ်အုပ်နဲ့ အမေ့ရဲ့ လက်ရေးနဲ့ရေးထားတဲ့ လိပ်စာတစ်ကြောင်း။ လမ်းဆုံးမှာ ဘာရှိမလဲ မသိပေမယ့် ပြန်လှည့်ဖို့တော့ မစဉ်းစားတော့ဘူး။",
      "နေ့လယ်မိုးရေက စိတ်ထဲမှာ ကျန်နေတဲ့ အဟောင်းတွေကို ဆေးကြောသွားသလိုပါပဲ။ နေရာဟောင်းတွေကို ဖြတ်သွားရင်း သူဟာ ကိုယ့်ကိုယ်ကိုယ် ပြန်တွေ့လာတယ်။"
    ]
  },
  {
    id: 2,
    title: "လေညင်းက ပြောသောစကား",
    author: "ခင်မမ",
    category: "ကဗျာ",
    year: "၂၀၂၃",
    readingTime: 8,
    color: "#e5c6b2",
    accent: "#8a4f3d",
    mark: "KK",
    tag: "ကဗျာစုစည်းမှု",
    rights: "full",
    summary: "လေညင်း၊ အိမ်ပြန်ချိန်နှင့် မပြောဖြစ်ခဲ့သော စကားများကို အဓိကထားသည့် ကဗျာတိုများ စုစည်းမှု။ ရိုးရှင်းသော စကားလုံးများထဲတွင် မြို့ပြဘဝ၏ နူးညံ့မှုကို ရှာတွေ့နိုင်သည်။",
    pages: [
      "လေညင်းက ပြောတယ် —\nမင်းမကြားခဲ့တဲ့ စကားတွေဟာ\nအရွက်တွေကြားမှာ မပျောက်သေးဘူး။",
      "အိမ်ပြန်ချိန်ဆိုတာ\nလမ်းတစ်လျှောက်က အလင်းရောင်တွေကို\nကိုယ့်အတွင်းထဲ ပြန်သယ်လာရတဲ့ အချိန်။",
      "မပြောဖြစ်ခဲ့တဲ့ စကားတွေကို\nညနေခင်းရဲ့ အေးမြမှုနဲ့ ထုပ်ပိုးပြီး\nမနက်ဖြန်ဆီ ပို့လိုက်တယ်။"
    ]
  },
  {
    id: 3,
    title: "မြစ်နှစ်စင်းကြားက ရွာ",
    author: "လင်းယုန်",
    category: "သမိုင်းဝတ္ထု",
    year: "၂၀၂၂",
    readingTime: 32,
    color: "#d6c6a9",
    accent: "#655139",
    mark: "LY",
    tag: "လူကြိုက်များ",
    rights: "full",
    summary: "မြစ်နှစ်စင်းကြားတွင် တည်ရှိသော ရွာငယ်တစ်ရွာ၏ မျိုးဆက်သုံးဆက် အကြောင်းကို သမိုင်းမှတ်တမ်းများနှင့် လူ့ဘဝအလွမ်းတို့ဖြင့် ရေးဖွဲ့ထားသည်။",
    pages: [
      "ရွာက မြစ်နှစ်စင်းကြားမှာ ရှိတယ်။ နွေရာသီရောက်ရင် ရေက တိတ်ဆိတ်သွားပြီး ဆောင်းရာသီမှာတော့ မြစ်ရဲ့ အသံက အိမ်တိုင်းထဲအထိ ဝင်လာတတ်တယ်။",
      "အဖိုးက အမြဲပြောတယ် — ရွာတစ်ရွာရဲ့ သမိုင်းဟာ စာအုပ်ထဲမှာပဲ မရှိဘူး၊ လူတွေရဲ့ လက်ဖဝါးမှာလည်း ရှိတယ်တဲ့။",
      "နှစ်တွေကြာလာတော့ မြစ်က လမ်းကြောင်းပြောင်းသွားတယ်။ ရွာကတော့ မပြောင်းဘဲ အမှတ်တရတွေကို ရေစီးနဲ့အတူ ထိန်းသိမ်းထားတယ်။"
    ]
  },
  {
    id: 4,
    title: "နေ့တစ်နေ့ကို နားလည်ခြင်း",
    author: "သက်ပိုင်",
    category: "အက်ဆေး",
    year: "၂၀၂၅",
    readingTime: 12,
    color: "#c7d4e5",
    accent: "#38567b",
    mark: "TP",
    tag: "အသစ်ထွက်",
    rights: "full",
    summary: "မနက်ခင်းကော်ဖီတစ်ခွက်၊ ဘတ်စ်ကားစောင့်နေချိန်နှင့် ညအိပ်ရာဝင်မတိုင်မီ စိတ်ထဲဖြတ်သန်းသွားသည့် အတွေးများကို ပြန်လည်ကြည့်ရှုစေသော အက်ဆေးများ။",
    pages: [
      "နေ့တစ်နေ့ဟာ အလုပ်စာရင်းတစ်ခုထက် ပိုပြီး ကျယ်ဝန်းတယ်။ မျက်နှာချင်းဆိုင်တွေ့တဲ့ လူတစ်ယောက်ရဲ့ အပြုံး၊ ပြတင်းပေါက်က ဝင်လာတဲ့ အလင်းဟာလည်း ဒီနေ့ရဲ့ အစိတ်အပိုင်းပဲ။",
      "အလျင်လိုနေတဲ့အခါ အချိန်ဟာ ပိုမြန်သွားတာမဟုတ်ဘူး။ ကိုယ်ကြည့်ဖို့ မေ့နေတဲ့ အသေးစိတ်တွေကပဲ ဝေးသွားတာ။",
      "ဒါကြောင့် ဒီနေ့ကို နားလည်ဖို့ မနက်ဖြန်အထိ မစောင့်ပါနဲ့။ ဒီနေ့မှာပဲ ဒီနေ့ကို ကြည့်ပါ။"
    ]
  },
  {
    id: 5,
    title: "တောင်ပေါ်မြို့ရဲ့ ညများ",
    author: "မြတ်နိုး",
    category: "ဝတ္ထု",
    year: "၂၀၂၁",
    readingTime: 24,
    color: "#b9c8d1",
    accent: "#334d62",
    mark: "MN",
    tag: "ညစာဖတ်ရန်",
    rights: "full",
    summary: "တောင်ပေါ်မြို့တစ်မြို့၏ အေးမြသောညများထဲတွင် သူစိမ်းနှစ်ယောက် မျှဝေလိုက်သော အိပ်မက်နှင့် မေးခွန်းများအကြောင်း။",
    pages: [
      "တောင်ပေါ်မြို့တွေမှာ ညက မြန်မြန်ကျတယ်။ အလင်းရောင်နည်းလေလေ လူတွေက ကိုယ့်စိတ်ထဲက အသံတွေကို ပိုရှင်းရှင်းကြားရလေလေပါပဲ။",
      "သူတို့နှစ်ယောက်က လက်ဖက်ရည်ဆိုင်အပြင်ဘက်မှာ ထိုင်ပြီး မြို့အောက်က မီးလုံးတွေကို ကြည့်နေကြတယ်။ တစ်ယောက်က မေးတယ် — မင်းဘယ်ကို သွားချင်တာလဲ။",
      "အဖြေမရှိတဲ့ မေးခွန်းတချို့ဟာလည်း လူကို ခရီးထွက်စေတတ်တယ်။"
    ]
  },
  {
    id: 6,
    title: "တောရိုင်းပန်းများ၏ ရာသီ",
    author: "မိုးခိုင်",
    category: "လူငယ်",
    year: "၂၀၂၅",
    readingTime: 14,
    color: "#e0c4cf",
    accent: "#7b405d",
    mark: "MK",
    tag: "လူငယ်ရွေးချယ်မှု",
    rights: "full",
    summary: "ကျောင်းပြီးခါစ သူငယ်ချင်းသုံးယောက်၏ ရွေးချယ်မှုများ၊ သတ္တိနှင့် အနာဂတ်အကြောင်း ရယ်စရာနူးညံ့မှုများဖြင့် ဖတ်ရလွယ်ကူအောင် ရေးထားသော ဝတ္ထု။",
    pages: [
      "တောရိုင်းပန်းတွေက ဘယ်သူစိုက်ထားတာမှ မဟုတ်ပေမယ့် သူတို့ရဲ့ ရာသီရောက်ရင် ပွင့်ကြတယ်။ ကျွန်မတို့လည်း အဲဒီလိုပဲလို့ သူက ပြောတယ်။",
      "သူငယ်ချင်းသုံးယောက်ဟာ မြို့ရဲ့ အစွန်ဆုံးလမ်းက ခုံတန်းလေးပေါ်မှာ အနာဂတ်ကို ခွဲဝေပြီး စိတ်ကူးယဉ်နေကြတယ်။",
      "မသေချာတာတွေ ရှိနေပေမယ့် တစ်ယောက်နဲ့တစ်ယောက် ရှိနေသရွေ့ ခရီးက မကြောက်စရာဘူး။"
    ]
  },
  {
    id: 7,
    title: "အလင်းရောင်ကို စောင့်သူ",
    author: "ဦးသိန်းလွင်",
    category: "သုတ",
    year: "၂၀၂၀",
    readingTime: 20,
    color: "#d5d0c2",
    accent: "#5d5844",
    mark: "TL",
    tag: "အတွေးစာ",
    rights: "summary",
    summary: "အလင်းရောင်၊ မျှော်လင့်ချက်နှင့် လူမှုဘဝအကြောင်း ရေးသားထားသော စာအုပ်ဖြစ်သော်လည်း လက်ရှိအချိန်တွင် အကျဉ်းချုပ်နှင့် metadata များကိုသာ ဖတ်ရှုခွင့်ပြုထားသည်။",
    pages: []
  },
  {
    id: 8,
    title: "စာရွက်ဖြူပေါ်က မှတ်စုများ",
    author: "ဆုမြတ်",
    category: "အက်ဆေး",
    year: "၂၀၁၉",
    readingTime: 10,
    color: "#d7c7ba",
    accent: "#795c4c",
    mark: "SM",
    tag: "စာရေးနည်း",
    rights: "summary",
    summary: "ရေးချင်စိတ်၊ မရေးဖြစ်သေးသော မှတ်စုများနှင့် စာရေးသူတစ်ယောက်၏ နေ့စဉ်အကျင့်များကို စုစည်းထားသော စာအုပ်။ မူပိုင်ခွင့်အခြေအနေကြောင့် အကျဉ်းချုပ်သာ ရရှိနိုင်သည်။",
    pages: []
  }
];

const coverPalette = [
  ["#cad7d3", "#264e4b"], ["#e5c6b2", "#8a4f3d"], ["#d6c6a9", "#655139"],
  ["#c7d4e5", "#38567b"], ["#b9c8d1", "#334d62"], ["#e0c4cf", "#7b405d"],
  ["#d5d0c2", "#5d5844"], ["#d7c7ba", "#795c4c"],
];

function readingProgressKey(book: Book) {
  return `thuthayatethar:progress:${book.slug ?? book.id}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function bookPdfProxyUrl(book: Pick<Book, "slug" | "pdfUrl">) {
  return book.slug ? `/api/books/${encodeURIComponent(book.slug)}/pdf` : book.pdfUrl;
}

function bookCoverProxyUrl(book: Pick<Book, "slug" | "coverImage">) {
  return book.slug ? `/api/books/${encodeURIComponent(book.slug)}/cover` : book.coverImage;
}

function soundcloudCoverProxyUrl(url?: string) {
  return url ? `/api/soundcloud/cover?url=${encodeURIComponent(url)}` : undefined;
}

function youtubeCoverUrl(url?: string) {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const videoId = host === "youtu.be" ? parsed.pathname.slice(1).split("/")[0] : parsed.searchParams.get("v");
    return videoId && /^[A-Za-z0-9_-]{6,20}$/.test(videoId) ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : undefined;
  } catch { return undefined; }
}

function readLocalValue(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeLocalValue(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* Storage may be unavailable in private/offline standalone mode. */ }
}

function getReadingProgress(book: Book) {
  try {
    const page = Number(localStorage.getItem(readingProgressKey(book)));
    const maxPage = book.pages.length ? book.pages.length - 1 : Number.MAX_SAFE_INTEGER;
    return Number.isInteger(page) && page >= 0 ? Math.min(page, maxPage) : 0;
  } catch { return 0; }
}

function getRecentReadings(booksToRead: Book[]): RecentReading[] {
  if (typeof window === "undefined") return [];
  try {
    const readableBooks = booksToRead.filter((book) => book.rights === "full" && !book.externalUrl && Boolean(book.pdfUrl || book.pages.length));
    const recent: RecentReading[] = [];
    for (const group of groupBooks(readableBooks)) {
      const chapterEntries: RecentReading[] = [];
      for (const book of group.chapters) {
        const key = readingProgressKey(book);
        const storedPage = localStorage.getItem(key);
        if (storedPage === null) continue;
        const page = Number(storedPage);
        if (!Number.isInteger(page) || page < 0) continue;
        const storedTotal = Number(localStorage.getItem(`${key}:total`));
        chapterEntries.push({
          group,
          book,
          page,
          totalPages: Number.isInteger(storedTotal) && storedTotal > 0 ? storedTotal : book.pages.length,
          updatedAt: Number(localStorage.getItem(`${key}:updatedAt`)) || 0,
        });
      }
      chapterEntries.sort((left, right) => right.updatedAt - left.updatedAt);
      if (chapterEntries[0]) recent.push(chapterEntries[0]);
    }
    return recent.sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 3);
  } catch { return []; }
}

export default function HomePage() {
  const [catalogBooks, setCatalogBooks] = useState<Book[] | null>(null);
  const catalogSnapshotRef = useRef("");
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [format, setFormat] = useState("စာအုပ်");
  const [selected, setSelected] = useState<Book | null>(null);
  const [readerBook, setReaderBook] = useState<Book | null>(null);
  const [audioBook, setAudioBook] = useState<Book | null>(null);
  const [page, setPage] = useState(0);
  const [theme, setTheme] = useState<Theme>(() => { if (typeof window === "undefined") return "paper"; const saved = readLocalValue("thuthayatethar:reader-theme"); return saved === "sepia" || saved === "night" ? saved : "paper"; });
  const [fontScale, setFontScale] = useState(1);
  const [lineHeight, setLineHeight] = useState(1.8);
  const [storageOpen, setStorageOpen] = useState(false);
  const [offlinePickerOpen, setOfflinePickerOpen] = useState(false);
  const [offlineSelection, setOfflineSelection] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { return readOfflineSelection(window.localStorage); } catch { return []; }
  });
  const [offlineBatchRunning, setOfflineBatchRunning] = useState(false);
  const [offlineBatchMessage, setOfflineBatchMessage] = useState("");
  const [offlineStatuses, setOfflineStatuses] = useState<Record<string, "saved" | "saving" | "error">>({});
  const [storageInfo, setStorageInfo] = useState({ usage: 0, quota: 0, bookCacheBytes: 0 });
  const [progressRevision, setProgressRevision] = useState(0);
  useEffect(() => { writeLocalValue("thuthayatethar:reader-theme", theme); }, [theme]);
  useEffect(() => {
    try { writeOfflineSelection(window.localStorage, offlineSelection); } catch { /* Storage may be disabled. */ }
  }, [offlineSelection]);
  useEffect(() => {
    const syncHashTab = () => {
      if (window.location.hash === "#audiobooks") {
        setFormat("အသံစာအုပ်");
      } else if (window.location.hash === "#wattpad") {
        setFormat("Wattpad");
      } else if (window.location.hash === "#catalog") {
        setFormat("စာအုပ်");
      }
    };
    syncHashTab();
    window.addEventListener("hashchange", syncHashTab);
    return () => window.removeEventListener("hashchange", syncHashTab);
  }, []);
  useEffect(() => {
    const refreshProgress = () => setProgressRevision((revision) => revision + 1);
    window.addEventListener("thuthayatethar:progress", refreshProgress);
    window.addEventListener("thuthayatethar:audio-progress", refreshProgress);
    window.addEventListener("storage", refreshProgress);
    return () => {
      window.removeEventListener("thuthayatethar:progress", refreshProgress);
      window.removeEventListener("thuthayatethar:audio-progress", refreshProgress);
      window.removeEventListener("storage", refreshProgress);
    };
  }, []);

  useEffect(() => {
    const cached = readLocalValue("thuthayatethar:catalog");
    let hasCachedCatalog = false;
    if (cached) {
      try {
        const cachedBooks = JSON.parse(cached) as Book[];
        if (Array.isArray(cachedBooks)) {
          hasCachedCatalog = true;
          const offlineSafeBooks = cachedBooks.filter((book): book is Book => Boolean(book && typeof book === "object" && typeof book.title === "string")).map((book) => ({
            ...book,
            title: correctedCatalogTitle(book.title),
            pdfUrl: book.pdfUrl || (!book.soundcloud_url && !book.externalUrl ? bookPdfProxyUrl(book) : undefined),
            coverImage: book.coverImage === "/covers/tian-guan-ci-fu.jpg"
              ? "/covers/tian-guan-ci-fu.webp"
              : book.coverImage === bookCoverProxyUrl(book)
                ? soundcloudCoverProxyUrl(book.soundcloud_url) || undefined
                : book.coverImage || soundcloudCoverProxyUrl(book.soundcloud_url) || youtubeCoverUrl(book.youtube_url) || undefined,
          }));
          catalogSnapshotRef.current = JSON.stringify(offlineSafeBooks);
          setCatalogBooks(offlineSafeBooks);
          writeLocalValue("thuthayatethar:catalog", catalogSnapshotRef.current);
          // Show cached cards immediately while the network refresh runs.
          setCatalogLoading(false);
        }
      } catch { /* Ignore a stale/corrupt cache and use the network response. */ }
    }
    let requestActive = false;
    let disposed = false;
    const refreshCatalog = () => {
      if (requestActive || disposed) return;
      requestActive = true;
      fetch(`/api/catalog?refresh=${Date.now()}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { ok?: boolean; configured?: boolean; books?: Array<Partial<Book> & { id?: string | number; pages?: string[]; pdfUrl?: string }> }) => {
        if (payload.ok !== true || payload.configured === false || !Array.isArray(payload.books)) { if (!hasCachedCatalog && !disposed) setCatalogBooks([]); return; }
        const nextBooks: Book[] = payload.books.filter((book): book is Partial<Book> & { title: string } => Boolean(book && typeof book === "object" && typeof book.title === "string")).map((book, index) => {
          const isTianGuanCiFu = book.slug?.startsWith("tian-guan-ci-fu-") ||
            book.title?.toLowerCase().includes("tian guan ci fu");
          return {
            id: typeof book.id === "number" ? book.id : index + 1,
            title: correctedCatalogTitle(book.title),
            author: book.author ?? "မသိရသေးသော စာရေးသူ",
            category: book.category ?? "အခြား",
            year: book.year ?? "—",
            readingTime: book.readingTime ?? 10,
            pages: book.pages ?? [],
            summary: book.summary ?? "",
            color: book.color ?? coverPalette[index % coverPalette.length][0],
            accent: book.accent ?? coverPalette[index % coverPalette.length][1],
            mark: book.mark ?? "စာ",
            rights: book.rights === "summary" ? "summary" as Rights : "full" as Rights,
            tag: book.tag ?? "ထုတ်ဝေထားသည်",
            // Large PDFs are served directly by the Cloudflare Worker/R2 URL
            // returned by the catalog. Keep the Vercel proxy as a fallback only
            // for actual reading items, never for external/audio-only books.
            pdfUrl: book.pdfUrl || (!book.soundcloud_url && !book.externalUrl ? bookPdfProxyUrl(book) : undefined),
            // Use a bundled cover for every chapter in this series because the
            // ingestion catalog currently has no cover object for these PDFs.
            coverImage: isTianGuanCiFu
              ? "/covers/tian-guan-ci-fu.webp"
              : book.coverImage || soundcloudCoverProxyUrl(book.soundcloud_url) || youtubeCoverUrl(book.youtube_url) || undefined,
            externalUrl: book.externalUrl,
            soundcloud_url: book.soundcloud_url,
            youtube_url: book.youtube_url,
            youtubeAudioStatus: book.youtubeAudioStatus,
            audio_url: book.audio_url,
            sourceType: book.sourceType,
            submissionSource: book.submissionSource,
            publicationStatus: book.publicationStatus,
            slug: book.slug,
          };
        });
        if (!disposed) {
          const nextSnapshot = JSON.stringify(nextBooks);
          // The API is polled periodically, but replacing the whole catalog with
          // equivalent objects makes the audiobook shelf rebuild needlessly and
          // can reset chapter selectors in mobile Safari/PWA sessions.
          if (nextSnapshot !== catalogSnapshotRef.current) {
            catalogSnapshotRef.current = nextSnapshot;
            setCatalogBooks(nextBooks);
            writeLocalValue("thuthayatethar:catalog", nextSnapshot);
          }
        }
      })
      .catch(() => { if (!hasCachedCatalog && !disposed) setCatalogBooks([]); })
      .finally(() => {
        requestActive = false;
        if (!disposed) setCatalogLoading(false);
      });
    };
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") refreshCatalog(); };
    refreshCatalog();
    const interval = window.setInterval(refreshCatalog, 30_000);
    window.addEventListener("focus", refreshCatalog);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshCatalog);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);
  useEffect(() => {
    if (!catalogBooks) return;
    const saved = readLocalValue("thuthayatethar:active-audiobook");
    if (!saved) return;
    try {
      const identity = JSON.parse(saved) as { slug?: string; id?: string | number };
      const book = catalogBooks.find((item) => (identity.slug && item.slug === identity.slug) || String(item.id) === String(identity.id));
      if (book?.audio_url || book?.soundcloud_url || book?.youtube_url) setAudioBook((current) => current ?? book);
    } catch { /* Ignore an invalid last-player record. */ }
  }, [catalogBooks]);
  useEffect(() => {
    const slug = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("read");
    if (!slug || !catalogBooks) return;
    const book = catalogBooks.find((item) => item.slug === slug);
    if (!book) return;
    if (book.rights !== "full" || !book.pdfUrl || book.externalUrl) {
      setSelected(book);
      window.history.replaceState(null, "", "#catalog");
      return;
    }
    setReaderBook(book);
    setPage(getReadingProgress(book));
    document.body.classList.add("reader-open");
  }, [catalogBooks]);

  const availableBooks = catalogBooks ?? [];
  function playAudiobook(book: Book) {
    if (!book.audio_url && !book.soundcloud_url && !book.youtube_url) return;
    setAudioBook((current) => {
      const sameIdentity = current && (current.slug ?? String(current.id)) === (book.slug ?? String(book.id));
      return sameIdentity && current?.audio_url === book.audio_url && current?.soundcloud_url === book.soundcloud_url && current?.youtube_url === book.youtube_url ? current : book;
    });
    writeLocalValue("thuthayatethar:active-audiobook", JSON.stringify({ slug: book.slug, id: book.id }));
  }
  function closeAudiobookPlayer() {
    setAudioBook(null);
    try { localStorage.removeItem("thuthayatethar:active-audiobook"); } catch { /* Storage may be unavailable. */ }
  }
  const recentReadings = useMemo(() => getRecentReadings(availableBooks), [availableBooks, progressRevision]);

  const offlineBookKey = (book: Book) => book.slug ?? String(book.id);
  async function refreshOfflineStorage() {
    if (!("caches" in window)) return;
    try {
      const cache = await caches.open("thuthayatethar-books");
      const next: Record<string, "saved" | "saving" | "error"> = {};
      for (const book of availableBooks) if (book.pdfUrl && await cache.match(book.pdfUrl)) next[offlineBookKey(book)] = "saved";
      let bookCacheBytes = 0;
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        if (!response) continue;
        const declaredSize = Number(response.headers.get("content-length"));
        bookCacheBytes += Number.isFinite(declaredSize) && declaredSize > 0 ? declaredSize : (await response.clone().blob()).size;
      }
      const estimate = await navigator.storage?.estimate?.();
      setOfflineStatuses((previous) => {
        for (const book of availableBooks) {
          const key = offlineBookKey(book);
          if (previous[key] === "saving") next[key] = "saving";
          else if (previous[key] === "error" && !next[key]) next[key] = "error";
        }
        return next;
      });
      setStorageInfo({ usage: estimate?.usage ?? 0, quota: estimate?.quota ?? 0, bookCacheBytes });
    } catch { /* Cache APIs may be unavailable in private mode. */ }
  }
  useEffect(() => {
    if (availableBooks.length) void refreshOfflineStorage();
  }, [catalogBooks]);
  useEffect(() => {
    const refresh = () => { void refreshOfflineStorage(); };
    window.addEventListener("thuthayatethar:offline-cache", refresh);
    return () => window.removeEventListener("thuthayatethar:offline-cache", refresh);
  }, [catalogBooks]);
  async function deleteOfflineBook(book: Book) {
    if (!("caches" in window)) return;
    try {
      const cache = await caches.open("thuthayatethar-books");
      const urls = [book.pdfUrl, bookPdfProxyUrl(book), book.coverImage].filter(Boolean).map((url) => new URL(url!, window.location.origin).href);
      for (const request of await cache.keys()) {
        if (urls.includes(request.url)) await cache.delete(request);
      }
      try { localStorage.removeItem(`thuthayatethar:offline:${offlineBookKey(book)}`); } catch { /* Storage may be unavailable. */ }
      setOfflineSelection((current) => current.filter((key) => key !== offlineBookKey(book)));
      setOfflineStatuses((current) => { const next = { ...current }; delete next[offlineBookKey(book)]; return next; });
      await refreshOfflineStorage();
    } catch {
      setOfflineStatuses((current) => ({ ...current, [offlineBookKey(book)]: "error" }));
    }
  }
  function toggleOfflineSelection(book: Book) {
    const key = offlineBookKey(book);
    setOfflineBatchMessage("");
    setOfflineSelection((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }
  async function saveSelectedOfflineBooks() {
    if (offlineBatchRunning) return;
    const chosen = offlineCandidates.filter((book) => offlineSelection.includes(offlineBookKey(book)) && offlineStatuses[offlineBookKey(book)] !== "saved");
    if (!chosen.length) {
      setOfflineBatchMessage("Offline သိမ်းရန် စာအုပ်ကို အရင်ရွေးပါ။");
      return;
    }
    setOfflineBatchRunning(true);
    setOfflineBatchMessage("");
    let savedCount = 0;
    let failedCount = 0;
    const failedKeys: string[] = [];
    try {
      for (let index = 0; index < chosen.length; index += 1) {
        const book = chosen[index];
        const key = offlineBookKey(book);
        setOfflineStatuses((current) => ({ ...current, [key]: "saving" }));
        setOfflineBatchMessage(`${index + 1} / ${chosen.length} အုပ် သိမ်းနေသည်…`);
        try {
          if (!("caches" in window) || !book.pdfUrl) throw new Error("offline_storage_unavailable");
          const directPdfUrl = book.pdfUrl;
          if (!directPdfUrl) throw new Error("offline_download_failed");
          const downloadUrl = window.location.hostname === "thuthayatethar.rz99systems.com" || !book.slug
            ? directPdfUrl
            : bookPdfProxyUrl(book) ?? directPdfUrl;
          const cache = await caches.open("thuthayatethar-books");
          const cached = await cache.match(book.pdfUrl) ?? (book.slug ? await cache.match(`/api/books/${encodeURIComponent(book.slug)}/pdf`) : undefined);
          const response = cached ?? await fetch(downloadUrl, { cache: "no-store" });
          if (!response.ok) throw new Error("offline_download_failed");
          await cache.put(book.pdfUrl, response.clone());
          if (book.slug) await cache.put(`/api/books/${encodeURIComponent(book.slug)}/pdf`, response.clone());
          writeLocalValue(`thuthayatethar:offline:${key}`, "1");
          setOfflineStatuses((current) => ({ ...current, [key]: "saved" }));
          savedCount += 1;
        } catch {
          setOfflineStatuses((current) => ({ ...current, [key]: "error" }));
          failedKeys.push(key);
          failedCount += 1;
        }
      }
      setOfflineSelection(failedKeys);
      setOfflineBatchMessage(`${savedCount} အုပ် Offline သိမ်းပြီး${failedCount ? ` · ${failedCount} မအောင်မြင်ပါ` : ""}`);
      if (savedCount) window.dispatchEvent(new Event("thuthayatethar:offline-cache"));
    } finally {
      setOfflineBatchRunning(false);
    }
  }

  const matchingAudioBooks = useMemo(() => {
    return availableBooks
      .filter((book) => Boolean(book.audio_url || book.soundcloud_url || book.youtube_url))
      .sort((left, right) => Number(isBedAungThaik(right)) - Number(isBedAungThaik(left)));
  }, [availableBooks]);
  const recentListening = useMemo<RecentListening | null>(() => {
    if (typeof window === "undefined") return null;
    try { return mostRecentListening(matchingAudioBooks, window.localStorage); }
    catch { return null; }
  }, [matchingAudioBooks, progressRevision]);
  const filteredBooks = useMemo(() => {
    return availableBooks.filter((book) => {
      const isWattpad = Boolean(book.externalUrl || book.sourceType === "wattpad");
      const isAudioOnly = Boolean((book.audio_url || book.soundcloud_url || book.youtube_url) && !book.pdfUrl && !book.pages.length);
      const matchesFormat = (format === "စာအုပ်" && !isWattpad && !book.audio_url && !book.soundcloud_url && !book.youtube_url) ||
        (format === "Wattpad" && isWattpad);
      return !isAudioOnly && matchesFormat;
    });
  }, [availableBooks, format]);
  const filteredGroups = useMemo(() => groupBooks(filteredBooks), [filteredBooks]);
  const visibleResultCount = format === "အသံစာအုပ်" ? matchingAudioBooks.length : filteredGroups.length;
  const savedOfflineBooks = availableBooks.filter((book) => book.pdfUrl && offlineStatuses[offlineBookKey(book)] === "saved");
  const offlineCandidates = useMemo(() => availableBooks.filter((book) => book.pdfUrl && book.rights === "full" && !book.externalUrl), [availableBooks]);
  const offlinePickerBooks = offlineCandidates;
  const storageRatio = storageInfo.quota > 0 ? storageInfo.usage / storageInfo.quota : 0;

  useEffect(() => {
    const stopReaderActions = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && ["c", "p", "s", "u"].includes(event.key.toLowerCase())) {
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", stopReaderActions);
    return () => window.removeEventListener("keydown", stopReaderActions);
  }, []);

  const openReader = (book: Book) => {
    if (book.rights !== "full") return;
    setSelected(null);
    setReaderBook(book);
    setPage(getReadingProgress(book));
    window.history.replaceState(null, "", `#read=${encodeURIComponent(book.slug ?? String(book.id))}`);
    document.body.classList.add("reader-open");
  };

  useEffect(() => {
    if (!readerBook || readerBook.pages.length === 0) return;
    try {
      const key = readingProgressKey(readerBook);
      localStorage.setItem(key, String(page));
      localStorage.setItem(`${key}:total`, String(readerBook.pages.length));
      localStorage.setItem(`${key}:updatedAt`, String(Date.now()));
      window.dispatchEvent(new Event("thuthayatethar:progress"));
    } catch { /* Storage may be disabled. */ }
  }, [readerBook, page]);

  const closeReader = () => {
    setReaderBook(null);
    window.history.replaceState(null, "", "#catalog");
    document.body.classList.remove("reader-open");
  };

  const resetFilters = () => {
    setFormat("စာအုပ်");
  };

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="သုတရိပ်သာ ပင်မစာမျက်နှာ">
          <span className="brand-mark"><span></span><span></span></span>
          <span><strong>သုတရိပ်သာ</strong><small>မြန်မာစာအုပ်များအတွက် ဒစ်ဂျစ်တယ်ရိပ်သာ</small></span>
        </a>
        <nav className="topnav" aria-label="အဓိကမီနူး">
          <a className={format === "စာအုပ်" ? "active" : ""} href="#catalog" aria-current={format === "စာအုပ်" ? "page" : undefined} onClick={() => setFormat("စာအုပ်")}>စာအုပ်များ</a>
          <a className={format === "အသံစာအုပ်" ? "active" : ""} href="#audiobooks" aria-current={format === "အသံစာအုပ်" ? "page" : undefined} onClick={() => setFormat("အသံစာအုပ်")}>အသံစာအုပ်</a>
          <a className={format === "Wattpad" ? "active" : ""} href="#wattpad" aria-current={format === "Wattpad" ? "page" : undefined} onClick={() => setFormat("Wattpad")}>Wattpad</a>
        </nav>
      </header>

      <section className="catalog-section" id="catalog">
        <span id="wattpad" className="nav-anchor-target" aria-hidden="true" />
        <div className="section-heading">
          <div><p className="eyebrow">စာကြည့်တိုက်</p><h2>{format === "အသံစာအုပ်" ? "အသံစာအုပ်" : format === "Wattpad" ? "Wattpad" : "စာအုပ်များ"}</h2></div>
          <span className="result-count">{visibleResultCount} အုပ်</span>
        </div>
        {format !== "အသံစာအုပ်" && recentReadings[0] && (() => {
          const item = recentReadings[0];
          const progress = item.totalPages > 0 ? Math.min(100, Math.round(((item.page + 1) / item.totalPages) * 100)) : 0;
          const title = groupTitle(item.group);
          return <section className="continue-reading" aria-label="ဖတ်လက်စစာအုပ်">
            <span className="continue-label">ဖတ်လက်စ</span>
            <button type="button" className="continue-compact" onClick={() => openReader(item.book)} aria-label={`${title} ကို စာမျက်နှာ ${item.page + 1} မှ ဆက်ဖတ်မည်`}>
              <span className="continue-summary-text"><strong>{title}</strong><small>{item.totalPages > 0 ? `စာမျက်နှာ ${item.page + 1} / ${item.totalPages}` : `စာမျက်နှာ ${item.page + 1}`}</small></span>
              <span className="continue-action">ဆက်ဖတ်မည် →</span>
              {item.totalPages > 0 && <span className="continue-progress" role="progressbar" aria-label={`${title} ဖတ်ရှုမှု`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></span>}
            </button>
          </section>;
        })()}
        <div id="audiobooks" className="audiobook-listing">
          {format === "အသံစာအုပ်" && recentListening && (() => {
            const item = recentListening;
            const progress = item.durationMs > 0 ? Math.min(100, Math.round((item.positionMs / item.durationMs) * 100)) : 0;
            return <section className="continue-reading continue-listening" aria-label="နားထောင်လက်စအသံစာအုပ်">
              <span className="continue-label">နားထောင်လက်စ</span>
              <button type="button" className="continue-compact" onClick={() => playAudiobook(item.book)} aria-label={`${item.book.title} မှ ဆက်နားထောင်မည်`}>
                <span className="continue-summary-text"><strong>{item.book.title}</strong><small>{item.durationMs > 0 ? `${formatAudioTime(item.positionMs)} / ${formatAudioTime(item.durationMs)}` : formatAudioTime(item.positionMs)}</small></span>
                <span className="continue-action">ဆက်နားထောင်မည် →</span>
                {item.durationMs > 0 && <span className="continue-progress" role="progressbar" aria-label={`${item.book.title} နားထောင်ပြီးမှု`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></span>}
              </button>
            </section>;
          })()}
          {format === "အသံစာအုပ်" && <AudiobookShelf books={matchingAudioBooks} onPlay={(book) => playAudiobook(book as Book)} />}
          {format === "အသံစာအုပ်" && !catalogLoading && !matchingAudioBooks.length && <div className="empty-state audiobook-empty"><span>♫</span><h3>အသံစာအုပ် မတွေ့ပါ</h3><p>Telegram ထဲသို့ SoundCloud link ပို့ထားပါက မကြာမီ ဒီနေရာတွင် ပေါ်လာပါမည်။</p></div>}
        </div>
        <div className="offline-actions" aria-label="Offline စာအုပ်စီမံရန်">
          <button type="button" className={`offline-picker-toggle${offlinePickerOpen ? " active" : ""}`} onClick={() => { setOfflinePickerOpen((open) => !open); setOfflineBatchMessage(""); }} aria-expanded={offlinePickerOpen} aria-controls="offline-picker-panel">
            <span className="offline-action-mark" aria-hidden="true">↓</span>
            <span className="offline-action-copy"><strong>Offline သိမ်းရန်</strong><small>{offlineSelection.length ? `${offlineSelection.length} အုပ် ရွေးထားသည်` : "စာအုပ်ရွေးပါ"}</small></span>
            <span className="offline-action-chevron" aria-hidden="true">{offlinePickerOpen ? "−" : "+"}</span>
          </button>
          <section className="offline-storage" aria-label="Offline သိမ်းထားသောစာအုပ်များ">
            <button type="button" className="offline-storage-toggle" onClick={() => { setStorageOpen((open) => !open); if (!storageOpen) void refreshOfflineStorage(); }} aria-expanded={storageOpen}>
              <span><strong>သိမ်းထားပြီး {savedOfflineBooks.length} အုပ်</strong><small>{formatBytes(storageInfo.bookCacheBytes)} · ဒီစက်</small></span>
              <span>{storageOpen ? "ပိတ် −" : "စီမံ +"}</span>
            </button>
            {storageOpen && <div className="offline-storage-panel">
              {storageRatio >= 0.9 && <p className="storage-warning" role="status">သိုလှောင်မှု ပြည့်ခါနီးပါပြီ။ မလိုသောစာအုပ်များကို ဖျက်ပြီး နေရာလွတ်လုပ်ပါ။</p>}
              <div className="offline-storage-list">{savedOfflineBooks.length ? savedOfflineBooks.map((book) => <article className="offline-storage-item" key={offlineBookKey(book)}><span><strong>{book.title}</strong><small>{book.author}</small></span><button type="button" className="offline-delete-button" onClick={() => void deleteOfflineBook(book)}>ဖျက်မည်</button></article>) : <p className="offline-storage-empty">Offline သိမ်းထားသောစာအုပ် မရှိသေးပါ။</p>}</div>
            </div>}
          </section>
        </div>
        {offlinePickerOpen && <section className="offline-picker-panel" id="offline-picker-panel" aria-label="Offline သိမ်းရန် စာအုပ်ရွေးရန်">
          <div className="offline-picker-heading"><strong>ဒီစက်တွင် သိမ်းမည့်စာအုပ်များ</strong><small>{savedOfflineBooks.length} အုပ် သိမ်းထားပြီး</small></div>
          <div className="offline-picker-list" role="group" aria-label="စာအုပ်ရွေးရန်">
            {offlinePickerBooks.length ? offlinePickerBooks.map((book) => {
              const key = offlineBookKey(book);
              const status = offlineStatuses[key];
              const checked = status === "saved" || offlineSelection.includes(key);
              return <label className="offline-picker-item" key={key}>
                <input type="checkbox" checked={checked} disabled={status === "saved" || status === "saving" || offlineBatchRunning} onChange={() => toggleOfflineSelection(book)} />
                <span className="offline-picker-book"><strong>{book.title}</strong><small>{book.author}</small></span>
                {status && <small className={`offline-picker-status is-${status}`}>{status === "saved" ? "သိမ်းပြီး" : status === "saving" ? "သိမ်းနေ…" : "ပြန်စမ်း"}</small>}
              </label>;
            }) : <p className="offline-picker-empty">စာအုပ်မတွေ့ပါ။</p>}
          </div>
          <div className="offline-picker-footer"><small>{offlineSelection.length} အုပ်ရွေးထားသည်</small><button type="button" onClick={() => void saveSelectedOfflineBooks()} disabled={!offlineSelection.length || offlineBatchRunning} aria-label="ရွေးထားသောစာအုပ်များကို Offline သိမ်းမည်">{offlineBatchRunning ? "သိမ်းနေသည်…" : "သိမ်းမည်"}</button></div>
          {offlineBatchMessage && <p className="offline-picker-message" role="status">{offlineBatchMessage}</p>}
        </section>}
        <div className="catalog-layout">
          <div className="book-grid" aria-live="polite">
            {catalogLoading && <div className="empty-state"><span>…</span><h3>စာအုပ်များကို ရယူနေသည်</h3><p>နောက်ဆုံး catalog ကို ခဏစောင့်ပေးပါ။</p></div>}
            {!catalogLoading && filteredGroups.map((group, index) => <BookCard
              key={group.book.id}
              group={group}
              index={index}
              onOpen={(book) => (book.audio_url || book.soundcloud_url || book.youtube_url) && !book.pdfUrl && !book.pages.length ? playAudiobook(book) : book.rights === "full" && !book.externalUrl ? openReader(book) : setSelected(book)}
            />)}
            {!catalogLoading && format !== "အသံစာအုပ်" && !filteredGroups.length && <div className="empty-state"><span>⌁</span><h3>ဒီလိုစာအုပ် မတွေ့သေးပါ</h3><p>လက်ရှိ Website catalog ထဲမှာ ထုတ်ဝေထားသောစာအုပ် မရှိသေးပါ။</p><button className="primary-button" type="button" onClick={resetFilters}>စာအုပ်များသို့ ပြန်သွားမည်</button></div>}
          </div>
        </div>
      </section>

      <footer className="footer"><div className="footer-brand"><span className="brand-mark"><span></span><span></span></span><strong>သုတရိပ်သာ</strong></div><p>မြန်မာစာပေကို အေးဆေးစွာ ဖတ်ရှုရန်။</p><span className="footer-right">© ၂၀၂၅ · Read only library</span></footer>

      {selected && <BookDetail book={selected} onClose={() => setSelected(null)} onRead={() => openReader(selected)} />}
      {readerBook && <Reader book={readerBook} page={page} setPage={setPage} theme={theme} setTheme={setTheme} fontScale={fontScale} setFontScale={setFontScale} lineHeight={lineHeight} setLineHeight={setLineHeight} onClose={closeReader} onListenAudio={() => playAudiobook(readerBook)} />}
      <AudiobookPlayer book={audioBook} onClose={closeAudiobookPlayer} preloadBooks={matchingAudioBooks} />
    </main>
  );
}

function BookCard({ group, index, onOpen }: { group: BookGroup; index: number; onOpen: (book: Book) => void }) {
  const { book, chapters } = group;
  const [selectedChapterId, setSelectedChapterId] = useState<number>(chapters[0]?.id ?? 0);
  useEffect(() => {
    if (!chapters.some((chapter) => chapter.id === selectedChapterId)) setSelectedChapterId(chapters[0]?.id ?? 0);
  }, [chapters, selectedChapterId]);
  const selectedChapter = chapters.find((chapter) => chapter.id === selectedChapterId) ?? chapters[0];
  return <article className="book-card" style={{ "--book-color": book.color, "--book-accent": book.accent, "--index": index } as CSSProperties}>
    <button type="button" className="cover-wrap" onClick={() => onOpen(book)} aria-label={`${book.title} အသေးစိတ်ကြည့်ရန်`}>
      <BookCover book={book} label={String(index + 1).padStart(2, "0")} />
      {book.rights === "summary" && !book.coverImage && !book.pdfUrl && <span className="summary-ribbon">အကျဉ်းချုပ်သာ</span>}
    </button>
    <div className="book-meta"><div><p className="book-category">{book.category} <span>·</span> {book.year}</p><h3>{groupTitle(group)}</h3><p className="book-author">{book.author}</p>{book.externalUrl && <small className="external-source-label">Wattpad မူရင်းစာမျက်နှာမှ ဖတ်ရှုရန်</small>}</div><button className="round-arrow" type="button" onClick={() => onOpen(book)} aria-label="အသေးစိတ်ကြည့်ရန်">↗</button></div>
    {chapters.length > 1 && <div className="chapter-list" aria-label={`${groupTitle(group)} အခန်းများ`}><span className="chapter-list-label">အခန်း {chapters.length} ခန်း · ဖတ်လိုသည့်အခန်း</span><div className="chapter-picker"><div className="chapter-select-wrap"><select id={`chapter-picker-${book.id}`} value={selectedChapterId} onChange={(event) => setSelectedChapterId(Number(event.target.value))} aria-label={`${groupTitle(group)} အခန်းရွေးရန်`}>{chapters.map((chapter, chapterIndex) => <option key={chapter.id} value={chapter.id}>{chapterLabel(chapter, chapterIndex + 1)}</option>)}</select></div><button type="button" className="chapter-open-button" onClick={() => selectedChapter && onOpen(selectedChapter)}>ဖတ်မည် →</button></div></div>}
    <div className="book-stats"><span>{chapters.length > 1 ? `◷ ${chapters.length} ခန်း` : book.externalUrl ? "Wattpad မူရင်း link" : `◷ ${book.readingTime} မိနစ်`}</span><span className={book.externalUrl ? "rights-summary" : book.rights === "full" ? "rights-full" : "rights-summary"}>{book.externalUrl ? "မူရင်းမှာဖတ်မည်" : book.rights === "full" ? "ဖတ်ရှုနိုင်သည်" : "အကျဉ်းချုပ်"}</span></div>

    </article>;
  }

function BookCover({ book, label }: { book: Book; label: string }) {
  const [pdfCover, setPdfCover] = useState<string | null>(null);
  const [coverImageFailed, setCoverImageFailed] = useState(false);
  const [coverImageLoaded, setCoverImageLoaded] = useState(false);
  // A PDF's first page is a valid cover fallback when ingestion did not
  // receive a separate Telegram thumbnail/cover image.
  const usePdfCover = Boolean(book.pdfUrl) && (!book.coverImage || coverImageFailed);
  useEffect(() => {
    setCoverImageFailed(false);
    setCoverImageLoaded(false);
    setPdfCover(null);
  }, [book.coverImage, book.pdfUrl]);
  useEffect(() => {
    if (!usePdfCover || !book.pdfUrl) return;
    let active = true;
    let coverObjectUrl: string | null = null;
    const showCover = (cover: Blob) => {
      if (!active) return;
      coverObjectUrl = URL.createObjectURL(cover);
      setPdfCover(coverObjectUrl);
    };
    void (async () => {
      const cacheKey = pdfCoverCacheKey(book.slug, book.id);
      const cachedCover = await readPdfCover(cacheKey);
      if (!active) return;
      if (cachedCover) {
        showCover(cachedCover);
        return;
      }
      let pdf: any;
      try {
        const pdfjs: any = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
        pdf = await pdfjs.getDocument({ url: book.pdfUrl, withCredentials: false, disableAutoFetch: true, disableStream: false }).promise;
        const page = await pdf.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(1.25, 900 / base.width) });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
        await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
        const cover = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
        if (cover) {
          await writePdfCover(cacheKey, cover);
          showCover(cover);
        }
      } catch { /* Keep the designed cover fallback if the PDF cannot be opened. */ }
      finally { if (pdf) await pdf.destroy().catch(() => {}); }
    })();
    return () => {
      active = false;
      if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
    };
  }, [book.id, book.slug, book.pdfUrl, usePdfCover]);
  const hasArtwork = coverImageLoaded || Boolean(pdfCover);
  const coverStyle: CSSProperties | undefined = pdfCover
    ? { backgroundImage: `url(${pdfCover})`, backgroundSize: "cover", backgroundPosition: "center" }
    : undefined;
  return (
    <div className={hasArtwork ? "book-cover book-cover-artwork" : "book-cover"} style={coverStyle}>
      {book.coverImage && !coverImageFailed && <img className="cover-artwork-image" src={book.coverImage} loading={label === "01" ? "eager" : "lazy"} decoding="async" onLoad={() => setCoverImageLoaded(true)} onError={() => setCoverImageFailed(true)} alt="" aria-hidden="true" />}
      {((book.coverImage && !coverImageLoaded && !coverImageFailed) || (usePdfCover && !pdfCover && book.pdfUrl)) && <span className="cover-loading" aria-hidden="true" />}
      {!hasArtwork && <>
        <span className="cover-number">{label}</span>
        <span className="cover-mark">{book.mark}</span>
        <strong>{book.title}</strong>
        <small>{book.author}</small>
        <i aria-hidden="true">✦</i>
      </>}
    </div>
  );
}

function BookDetail({ book, onClose, onRead }: { book: Book; onClose: () => void; onRead: () => void }) {
  return <div className="overlay" role="dialog" aria-modal="true" aria-label="စာအုပ်အသေးစိတ်"><div className="detail-panel">
    <button className="close-button" type="button" onClick={onClose} aria-label="ပိတ်မည်">×</button>
    <div className="detail-cover" style={{ "--book-color": book.color, "--book-accent": book.accent } as CSSProperties}><BookCover book={book} label={book.year} /></div>
    <div className="detail-content"><p className="eyebrow">{book.externalUrl ? "WATTPAD မူရင်း" : book.tag}</p><h2>{book.title}</h2><p className="detail-author">{book.author}</p><div className="detail-facts"><span><b>အမျိုးအစား</b>{book.category}</span><span><b>ဖတ်ရှုချိန်</b>{book.readingTime} မိနစ်</span><span><b>ထုတ်ဝေသည့်နှစ်</b>{book.year}</span></div><div className="detail-summary"><p className="label">{book.externalUrl ? "မူရင်းစာမျက်နှာ" : "အကျဉ်းချုပ်"}</p><p>{book.externalUrl ? "ဤစာအုပ်ကို မူရင်း Wattpad စာမျက်နှာတွင်သာ ဖတ်ရှုပါ။" : book.summary}</p></div>
      {book.externalUrl ? <a className="primary-button wide-button" href={book.externalUrl} target="_blank" rel="noreferrer">Wattpad တွင်ဖတ်မည် <span>↗</span></a> : book.rights === "full" ? <button className="primary-button wide-button" type="button" onClick={onRead}>စာမျက်နှာဖွင့်မည် <span>→</span></button> : <div className="rights-alert"><span>i</span><p><strong>လက်ရှိတွင် အကျဉ်းချုပ်သာ ဖတ်ရှုနိုင်သည်</strong><br />မူပိုင်ခွင့်ခွင့်ပြုချက်ရရှိပြီးနောက် စာအုပ်အပြည့်အစုံကို ထည့်သွင်းပေးမည်။</p></div>}
    </div>
  </div></div>;
}

type ReaderProps = { book: Book; page: number; setPage: (page: number) => void; theme: Theme; setTheme: (theme: Theme) => void; fontScale: number; setFontScale: (scale: number) => void; lineHeight: number; setLineHeight: (height: number) => void; onClose: () => void; onListenAudio: () => void };

function PdfReader({ book, theme, setTheme, onClose, onListenAudio }: { book: Book; theme: Theme; setTheme: (theme: Theme) => void; onClose: () => void; onListenAudio: () => void }) {
  const shell = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [readerUiHidden, setReaderUiHidden] = useState(false);
  const [offlineSaved, setOfflineSaved] = useState(false);
  const [savingOffline, setSavingOffline] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const onChange = () => {
      const active = document.fullscreenElement === shell.current;
      setFullscreen(active);
      if (!active) setReaderUiHidden(false);
    };
    const onConnectionChange = () => setIsOnline(navigator.onLine);
    document.addEventListener("fullscreenchange", onChange);
    window.addEventListener("online", onConnectionChange);
    window.addEventListener("offline", onConnectionChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      window.removeEventListener("online", onConnectionChange);
      window.removeEventListener("offline", onConnectionChange);
    };
  }, []);
  async function toggleFullscreen() {
    const nextHidden = !readerUiHidden;
    setReaderUiHidden(nextHidden);
    try {
      if (document.fullscreenElement === shell.current) {
        if (!nextHidden) await document.exitFullscreen();
      } else if (nextHidden) {
        // CSS focus mode remains available in iOS and Messenger browsers that reject Fullscreen API.
        await shell.current?.requestFullscreen?.();
      }
    } catch { /* Keep the CSS focus mode when native fullscreen is unavailable. */ }
  }
  async function showReaderControls() {
    setReaderUiHidden(false);
    if (document.fullscreenElement === shell.current) {
      try { await document.exitFullscreen(); } catch { /* The visible controls remain the fallback. */ }
    }
  }
  async function saveOffline() {
    if (!book.pdfUrl || !("caches" in window)) return;
    setSavingOffline(true);
    setDownloadError("");
    try {
      const downloadUrl = window.location.hostname === "thuthayatethar.rz99systems.com" || !book.slug
        ? book.pdfUrl
        : offlinePdfUrl;
      const cache = await caches.open("thuthayatethar-books");
      const response = await cache.match(book.pdfUrl) ?? (book.slug ? await cache.match(offlinePdfUrl) : undefined) ?? await fetch(downloadUrl, { cache: "no-store" });
      if (!response.ok) throw new Error("offline_download_failed");
      await cache.put(book.pdfUrl, response.clone());
      if (book.slug) await cache.put(`/api/books/${encodeURIComponent(book.slug)}/pdf`, response.clone());
      writeLocalValue(`thuthayatethar:offline:${book.slug ?? book.id}`, "1");
      setOfflineSaved(true);
      window.dispatchEvent(new Event("thuthayatethar:offline-cache"));
    } catch {
      setOfflineSaved(false);
      setDownloadError(isOnline ? "သိမ်းမအောင်မြင်ပါ။ Internet ကိုစစ်ပြီး ပြန်စမ်းပါ။" : "Internet မရှိပါ။ Offline သိမ်းရန် Internet ပြန်ချိတ်ပြီး ပြန်စမ်းပါ။");
    } finally { setSavingOffline(false); }
  }
  useEffect(() => { setOfflineSaved(readLocalValue(`thuthayatethar:offline:${book.slug ?? book.id}`) === "1"); }, [book.id, book.slug]);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const cache = await caches.open("thuthayatethar-books");
        const cached = await cache.match(book.pdfUrl!);
        const saved = Boolean(cached);
        if (active) setOfflineSaved(saved);
        if (!saved) try { localStorage.removeItem(`thuthayatethar:offline:${book.slug ?? book.id}`); } catch { /* Storage may be unavailable. */ };
      } catch { if (active) setOfflineSaved(false); }
    })();
    return () => { active = false; };
  }, [book.pdfUrl, book.id, book.slug]);
  const offlinePdfUrl = book.slug ? `/api/books/${encodeURIComponent(book.slug)}/pdf` : book.pdfUrl ?? "";
  const productionPdfOrigin = typeof window !== "undefined" && window.location.hostname === "thuthayatethar.rz99systems.com";
  const readerPdfUrl = productionPdfOrigin ? book.pdfUrl ?? "" : offlinePdfUrl || book.pdfUrl || "";
  const standaloneReaderUrl = book.slug ? `/#read=${encodeURIComponent(book.slug)}` : undefined;
  return <div ref={shell} className={`reader-shell pdf-reader-shell theme-${theme}${readerUiHidden ? " reader-ui-hidden" : ""}`} onContextMenu={(event) => event.preventDefault()}><header className="reader-header"><button type="button" className="reader-back" onClick={onClose} aria-label="စာကြည့်တိုက်သို့ ပြန်မည်">← <span>စာကြည့်တိုက်</span></button><div className="reader-title"><span>ဖတ်ရှုနေသည်</span><strong>{book.title}</strong></div><div className="reader-header-actions"><div className="reader-theme-buttons" role="group" aria-label="ဖတ်ရှုရန်အရောင်"><button type="button" className={theme === "paper" ? "active paper" : "paper"} onClick={() => setTheme("paper")} aria-label="စာရွက်အရောင်">●</button><button type="button" className={theme === "sepia" ? "active sepia" : "sepia"} onClick={() => setTheme("sepia")} aria-label="Sepia အရောင်">●</button><button type="button" className={theme === "night" ? "active night" : "night"} onClick={() => setTheme("night")} aria-label="ညအရောင်">●</button></div><button type="button" className="reader-offline" onClick={saveOffline} disabled={savingOffline} aria-label="Offline သိမ်းမည်">{savingOffline ? "…" : offlineSaved ? "✓" : "⇩"}<span>{offlineSaved ? "Offline သိမ်းပြီး" : "Offline သိမ်းမည်"}</span></button><button type="button" className="reader-fullscreen" onClick={toggleFullscreen} aria-label={fullscreen ? "အပြည့်မျက်နှာပြင်ပိတ်မည်" : "အပြည့်မျက်နှာပြင်ဖွင့်မည်"}>{fullscreen ? "⤢" : "⛶"}<span>{fullscreen ? "ပိတ်မည်" : "အပြည့်"}</span></button><div className="reader-lock">▣ ဖတ်ရှုရန်သီးသန့်</div></div></header><div className="pdf-reader-workspace">{(book.soundcloud_url || book.youtube_url) && <button type="button" className="reader-audiobook-toggle" onClick={onListenAudio}>♫ <span>အသံစာအုပ်ကို နားထောင်ရန်</span></button>}<FlipBook key={book.slug ?? book.id} url={readerPdfUrl} offlineUrl={offlinePdfUrl} standaloneUrl={standaloneReaderUrl} title={book.title} progressKey={readingProgressKey(book)} /></div>{readerUiHidden && <button type="button" className="reader-controls-reveal" onClick={() => void showReaderControls()} aria-label="ဖတ်ရှုထိန်းချုပ်မှုများ ပြန်ဖော်မည်" title="ထိန်းချုပ်မှုများ ပြန်ဖော်ရန်">☰</button>}{downloadError && <div className="reader-offline-error" role="status"><span>{downloadError}</span><button type="button" onClick={saveOffline} disabled={savingOffline}>ပြန်စမ်းမည်</button></div>}<footer className="reader-nav"><span>လက်နှစ်ချောင်းဖြင့် ချဲ့ကြည့်နိုင်ပါသည်။</span></footer></div>;
}
function Reader(props: ReaderProps) {
  if (props.book.pages.length === 0 && props.book.pdfUrl) return <PdfReader book={props.book} theme={props.theme} setTheme={props.setTheme} onClose={props.onClose} onListenAudio={props.onListenAudio} />;
  return <TextReader {...props} />;
}

function TextReader({ book, page, setPage, theme, setTheme, fontScale, setFontScale, lineHeight, setLineHeight, onClose }: ReaderProps) {
  const pageCount = book.pages.length;
  return <div className={`reader-shell theme-${theme}`} onContextMenu={(event) => event.preventDefault()}>
    <header className="reader-header"><button type="button" className="reader-back" onClick={onClose} aria-label="စာကြည့်တိုက်သို့ ပြန်မည်">← <span>စာကြည့်တိုက်</span></button><div className="reader-title"><span>ဖတ်ရှုနေသည်</span><strong>{book.title}</strong></div><div className="reader-lock">▣ ဖတ်ရှုရန်သီးသန့်</div></header>
    <div className="reader-workspace"><aside className="reader-tools"><p className="tools-label">ဖတ်ရှုမှု ပြင်ဆင်ရန်</p><div className="tool-group"><span>စာလုံးအရွယ်</span><div className="tool-buttons"><button type="button" onClick={() => setFontScale(Math.max(.86, fontScale - .08))}>A−</button><b>{Math.round(fontScale * 100)}%</b><button type="button" onClick={() => setFontScale(Math.min(1.2, fontScale + .08))}>A＋</button></div></div><div className="tool-group"><span>စာကြောင်းအကွာ</span><div className="tool-buttons"><button type="button" onClick={() => setLineHeight(Math.max(1.5, lineHeight - .15))}>−</button><b>{lineHeight.toFixed(1)}</b><button type="button" onClick={() => setLineHeight(Math.min(2.2, lineHeight + .15))}>＋</button></div></div><div className="tool-group"><span>နောက်ခံ</span><div className="theme-buttons"><button type="button" aria-label="စာရွက်နောက်ခံ" className={theme === "paper" ? "active" : ""} onClick={() => setTheme("paper")}></button><button type="button" aria-label="အညိုနောက်ခံ" className={theme === "sepia" ? "active sepia" : "sepia"} onClick={() => setTheme("sepia")}></button><button type="button" aria-label="ညနောက်ခံ" className={theme === "night" ? "active night" : "night"} onClick={() => setTheme("night")}></button></div></div><div className="reader-tip"><span>✦</span> ဖတ်နေစဉ် အလင်းရောင်ကို လျှော့ပြီး စိတ်အေးအေးထားပါ။</div></aside>
      <article className="reader-page" style={{ fontSize: `${fontScale}rem`, lineHeight }}><div className="page-topline"><span>{book.category}</span><span>{book.year}</span></div><div className="page-content"><p className="page-kicker">{book.title}</p><h1>{page === 0 ? book.title : `အခန်း ${page + 1}`}</h1><p className="page-author">{book.author}</p><div className="page-rule"></div>{book.pages[page].split("\n").map((line, index) => <p key={`${page}-${index}`}>{line || " "}</p>)}</div><div className="page-footer"><span>သုတရိပ်သာ · {book.id.toString().padStart(2, "0")}</span><b>{String(page + 1).padStart(2, "0")} / {String(pageCount).padStart(2, "0")}</b></div></article>
    </div><footer className="reader-nav"><button type="button" disabled={page === 0} onClick={() => setPage(Math.max(0, page - 1))}>← အရင်စာမျက်နှာ</button><div className="page-dots">{book.pages.map((_, index) => <button key={index} type="button" className={page === index ? "active" : ""} onClick={() => setPage(index)} aria-label={`စာမျက်နှာ ${index + 1}`}></button>)}</div><button type="button" disabled={page === pageCount - 1} onClick={() => setPage(Math.min(pageCount - 1, page + 1))}>နောက်စာမျက်နှာ →</button></footer>
  </div>;
}
